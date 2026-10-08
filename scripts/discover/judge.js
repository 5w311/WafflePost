// The judging half of the discovery sweep: what each model is asked, the
// shape it must answer in, what a run costs, and how two independent answers
// are reconciled. Pure - scripts/discover.js does the network.
//
// TWO MODELS, AND THE SECOND NEVER SEES THE FIRST. v4.15.0 established the
// truck stop addresses with "blind web research that never saw" the audited
// figure, because a researcher shown an answer tends to find it. The same
// rule holds here: Opus 5.5 and Fable 5.1 get the identical prompt, and
// neither is ever shown the other's verdict. Agreement between them is only
// worth something because of that.
//
// WHAT THE MODELS MAY NOT DO is the 13-2026 campaign's trap list, and it is
// in the system prompt in so many words:
//   - estimate a distance. Every one of eleven estimated candidates measured
//     wrong. The prompt never asks for feet and the verdict schema has no
//     field to put one in.
//   - call a business closed on one source. Knoxville's TA was nearly purged
//     off a stale directory flag.
//   - treat a shared road name as a shared interchange (Valley St,
//     West Memphis, Fayetteville).
//   - compose an address. An address is either quoted from a page whose URL
//     is attached, or it is empty.
//
// A verdict of `candidate` is not a row. It is the input to the existing
// gate: geocode the agreed truck stop address, haversine it with
// lib/waffledist, and check it by hand against satellite and Trucker Path
// the way the 09-2026 spot-check did.

var MODELS = {
  opus:  { id: 'claude-opus-5-5',  label: 'Opus 5.5' },
  fable: { id: 'claude-fable-5-1', label: 'Fable 5.1' }
};

// USD per million tokens, from platform.claude.com/docs pricing as read on
// 2026-10-07. Prices change; if Anthropic's page disagrees with this table,
// the page is right and this table is stale. Thinking tokens are billed as
// output and arrive inside output_tokens. Cache writes are the 5-minute kind.
var PRICES = {
  'claude-opus-5-5':  { input: 4,  output: 20, cacheWrite: 5,     cacheRead: 0.20 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.50, cacheRead: 0.25 }
};
var SEARCH_USD = 0.01;      // $10 per 1,000 web searches
var MAX_SEARCHES = 8;
var MAX_FETCHES = 4;

var SYSTEM = [
  'You are verifying one lead for WafflePost, a free app that tells semi truck drivers where they can park at a truck stop and walk to a Waffle House. A driver will act on this at 3am in a 70-foot rig. A wrong "yes" strands them; a wrong "no" only hides a good stop. When in doubt, say unknown.',
  '',
  'You are given one Waffle House and one or more truck-capable places near it, taken from OpenStreetMap. OpenStreetMap is a lead, not proof: businesses close, open, rebrand and get mapped at the wrong spot.',
  '',
  'Use web search (and web fetch to read a page) to establish, with a source URL for every claim:',
  '1. Is this Waffle House operating now, and is it full service or limited (pickup only, delivery only, window service some hours)?',
  '2. Which listed place is the real truck stop pairing, if any, and is it operating now?',
  '3. Does that place actually let semi trucks park? Overnight allowed or prohibited? Free or paid? Roughly how many truck spaces? CAT scale? A sit-down restaurant inside?',
  '4. Are the Waffle House and the truck stop at the SAME interchange, on the same side, with a walkable route between them?',
  '5. Any driver evidence (reviews, forums, trucker apps) about walking between them, or anything a driver should know first (tickets for a U-turn, lot leased out, unsafe crossing).',
  '6. The interstate corridor and exit number, and the exit name.',
  '',
  'Hard rules. Breaking any of them makes the lead worthless:',
  '- NEVER estimate or report a distance in feet, yards or miles, and never describe one as "next door" or "across the street" from addresses alone. Distances are measured later from audited coordinates. Every one of eleven earlier leads that arrived with an estimated distance measured wrong, one by a factor of fourteen.',
  '- A business is closed only if two independent, recent sources say so. A single directory "permanently closed" flag nearly purged a live truck stop before.',
  '- A shared road name is NOT a shared interchange. Two addresses on the same street have been measured at opposite ends of it, more than a mile apart. Adjacent exits in the same town with the same signage are the most common failure.',
  '- If the straight line between the two crosses an interstate, the walk is whatever crossing exists (an overpass, an underpass), or none. Say which, with a source, or say unknown.',
  '- Never compose an address. Copy it from a page you cite, or leave it empty.',
  '- "unknown" is always an acceptable answer. A guess presented as a fact is not.',
  '',
  'When you are done, call record_verdict exactly once. Use verdict "candidate" only if the Waffle House is operating, the truck stop is operating, it allows semi parking, and both are at the same interchange - each established by a cited source. Use "reject" when a source establishes that one of those is false. Otherwise use "unresolved". Keep note_draft to the specific thing a driver needs, in plain words, or leave it empty; do not pad it with generic copy.'
].join('\n');

var TRI = { type: 'string', enum: ['yes', 'no', 'unknown'] };
var EVIDENCE = {
  type: 'array',
  items: {
    type: 'object',
    properties: { claim: { type: 'string' }, url: { type: 'string' } },
    required: ['claim', 'url']
  }
};

var RECORD_TOOL = {
  name: 'record_verdict',
  description: 'Record the finished verdict for this lead. Call exactly once, at the end.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['candidate', 'reject', 'unresolved'] },
      reject_reason: { type: 'string', enum: ['none', 'waffle_house_closed', 'truck_stop_closed',
        'no_semi_parking', 'different_interchange', 'no_walkable_crossing', 'not_a_truck_stop', 'other'] },
      corridor: { type: 'string', description: 'e.g. I-75, or empty if unknown' },
      exit: { type: 'string', description: 'exit number as signed, or empty' },
      exit_name: { type: 'string', description: 'the exit/town name, or empty' },
      state: { type: 'string', description: 'two-letter state code' },
      waffle_house: {
        type: 'object',
        properties: {
          operating: TRI,
          service: { type: 'string', enum: ['full', 'limited', 'unknown'] },
          address: { type: 'string', description: 'copied from a cited page, or empty' },
          evidence: EVIDENCE
        },
        required: ['operating', 'service', 'address', 'evidence']
      },
      truck_stop: {
        type: 'object',
        properties: {
          osm_id: { type: 'string', description: 'which listed place this is, or empty if none fits' },
          operator_name: { type: 'string' },
          operating: TRI,
          semi_parking: TRI,
          overnight: { type: 'string', enum: ['allowed', 'prohibited', 'unknown'] },
          parking_cost: { type: 'string', enum: ['free', 'paid', 'unknown'] },
          approx_truck_spaces: { type: 'string', description: 'as a source states it, or empty' },
          cat_scale: TRI,
          sit_down_restaurant: TRI,
          address: { type: 'string', description: 'copied from a cited page, or empty' },
          evidence: EVIDENCE
        },
        required: ['osm_id', 'operator_name', 'operating', 'semi_parking', 'overnight',
                   'parking_cost', 'cat_scale', 'sit_down_restaurant', 'address', 'evidence']
      },
      same_interchange: TRI,
      walk_crosses_highway: TRI,
      crossing_detail: { type: 'string', description: 'the overpass/underpass if the walk crosses, with source, or empty' },
      driver_walk_evidence: EVIDENCE,
      caution: { type: 'string', description: 'what a driver must know first, or empty' },
      note_draft: { type: 'string' },
      open_questions: { type: 'array', items: { type: 'string' } }
    },
    required: ['verdict', 'reject_reason', 'corridor', 'exit', 'state', 'waffle_house',
               'truck_stop', 'same_interchange', 'walk_crosses_highway', 'driver_walk_evidence',
               'caution', 'note_draft', 'open_questions']
  }
};

// The lead, as the model sees it. The OSM straight-line figure is withheld
// on purpose: shown a number, a researcher anchors on it, and the atlas
// re-measures it anyway. The crossing flag is geometry, not an estimate, so
// it is passed through.
function leadText(c) {
  var wh = c.wafflehouse;
  var lines = [
    'WAFFLE HOUSE (OpenStreetMap ' + wh.osmId + ')',
    '  coordinates: ' + wh.lat.toFixed(5) + ', ' + wh.lon.toFixed(5),
    '  mapped address: ' + (wh.address || '(none mapped)'),
    '  tags: ' + JSON.stringify(wh.tags),
    '',
    'NEARBY TRUCK-CAPABLE PLACES (nearest first):'
  ];
  c.stops.forEach(function (s, i) {
    lines.push((i + 1) + '. ' + s.name + ' (OpenStreetMap ' + s.osmId + ')');
    lines.push('   coordinates: ' + s.lat.toFixed(5) + ', ' + s.lon.toFixed(5));
    lines.push('   mapped address: ' + (s.address || '(none mapped)'));
    lines.push('   map classification: ' + (s.truckClass === 'truck'
      ? 'tagged or branded as a truck stop'
      : 'UNCERTAIN - may not allow semis; establish this'));
    if (s.crosses.length) {
      lines.push('   THE STRAIGHT LINE TO THIS PLACE CROSSES: ' +
        s.crosses.map(function (r) { return r.label; }).join(', ') +
        '. Find the actual crossing or say there is none.');
    }
    lines.push('   tags: ' + JSON.stringify(s.tags));
  });
  return lines.join('\n');
}

function requestBody(modelId, candidate, priorMessages) {
  return {
    model: modelId,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES,
        user_location: { type: 'approximate', country: 'US' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_FETCHES,
        max_content_tokens: 12000 },
      RECORD_TOOL
    ],
    messages: priorMessages || [{ role: 'user', content: leadText(candidate) }]
  };
}

// The verdict is the input of the record_verdict call, wherever in the
// content it appears. Null when the model never called it.
function extractVerdict(content) {
  var block = (content || []).filter(function (b) {
    return b.type === 'tool_use' && b.name === 'record_verdict';
  })[0];
  return block ? block.input : null;
}

function emptyUsage() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0 };
}

function addUsage(acc, u) {
  u = u || {};
  acc.input += u.input_tokens || 0;
  acc.output += u.output_tokens || 0;
  acc.cacheWrite += u.cache_creation_input_tokens || 0;
  acc.cacheRead += u.cache_read_input_tokens || 0;
  acc.searches += ((u.server_tool_use || {}).web_search_requests) || 0;
  return acc;
}

function costUSD(modelId, usage) {
  var p = PRICES[modelId];
  if (!p) throw new Error('no price for ' + modelId + ' - add it to PRICES before spending on it');
  return (usage.input * p.input + usage.output * p.output +
          usage.cacheWrite * p.cacheWrite + usage.cacheRead * p.cacheRead) / 1e6 +
         usage.searches * SEARCH_USD;
}

// Deterministic 0..1 from a string, so the audit sample of Opus rejections
// is the same sample on every rerun and a resumed run does not reshuffle.
function hash01(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// Which candidates Fable sees. Everything Opus did not reject, plus a fixed
// share of what it did reject - a second opinion that only ever reviews
// Opus's yeses can confirm false positives but never catch a false negative.
// `all` sends every candidate to Fable.
function fableQueue(candidates, opusResults, opts) {
  opts = opts || {};
  var share = opts.auditShare == null ? 0.25 : opts.auditShare;
  return candidates.filter(function (c) {
    if (opts.all) return true;
    var r = opusResults[c.id];
    if (!r || !r.verdict) return true;            // Opus failed: Fable is the only pass
    if (r.verdict.verdict !== 'reject') return true;
    return hash01(c.id) < share;
  });
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/#\s*\d+/g, '').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(travel|center|centre|centers|stopping|truck|stop|plaza|express|inc|llc)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Street line only: house number plus the first street word, enough to tell
// 2310 Highway 62 from 2205 Highway 62, which is the disagreement that matters.
function streetKey(addr) {
  var m = String(addr || '').toLowerCase().match(/^\s*(\d+[a-z]?)\s+([a-z0-9]+)/);
  return m ? m[1] + ' ' + m[2] : '';
}

function sameStop(a, b) {
  if (a.osm_id && b.osm_id) return a.osm_id === b.osm_id;
  var na = norm(a.operator_name), nb = norm(b.operator_name);
  return !!na && !!nb && (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1);
}

// Flags are only suggested where BOTH models say so with a cited source.
// The atlas's own rule: flags carry "ONLY what the audit actually confirmed",
// and unknown is not the same as false.
function agreedFlags(a, b) {
  var ta = a.truck_stop, tb = b.truck_stop, flags = [];
  if (ta.parking_cost === 'free' && tb.parking_cost === 'free' &&
      ta.overnight === 'allowed' && tb.overnight === 'allowed') flags.push('free');
  if (ta.cat_scale === 'yes' && tb.cat_scale === 'yes') flags.push('scale');
  if (ta.sit_down_restaurant === 'yes' && tb.sit_down_restaurant === 'yes') flags.push('diner');
  if (a.waffle_house.service === 'limited' && b.waffle_house.service === 'limited') flags.push('limited');
  return flags;
}

function establishes(v) {
  return v.verdict === 'candidate' && v.waffle_house.operating === 'yes' &&
    v.truck_stop.operating === 'yes' && v.truck_stop.semi_parking === 'yes' &&
    v.same_interchange === 'yes' && (v.truck_stop.evidence || []).length > 0;
}

// Outcome per candidate:
//   VERIFY NEXT  both models establish the pair and agree which stop it is.
//                Goes to geocode + human check. Still not a row.
//   DISPUTED     they disagree, or agree on candidate with different stops,
//                or different street addresses. Read both; decide by hand.
//   ONE MODEL    only one verdict exists (budget ran out, or a call failed).
//   REJECTED     both reject. Recorded so nobody re-finds it.
//   UNRESOLVED   neither could establish it either way.
function reconcile(a, b) {
  if (!a && !b) return { status: 'UNRESOLVED', why: 'no verdict from either model' };
  if (!a || !b) {
    var only = a || b;
    return { status: 'ONE MODEL', why: 'single ' + only.verdict + ' verdict', flags: [] };
  }
  if (a.verdict === 'reject' && b.verdict === 'reject') {
    return { status: 'REJECTED', why: a.reject_reason + ' / ' + b.reject_reason, flags: [] };
  }
  if (establishes(a) && establishes(b)) {
    if (!sameStop(a.truck_stop, b.truck_stop)) {
      return { status: 'DISPUTED', why: 'both say candidate but name different stops', flags: [] };
    }
    var ka = streetKey(a.truck_stop.address), kb = streetKey(b.truck_stop.address);
    if (ka && kb && ka !== kb) {
      return { status: 'DISPUTED', why: 'same stop, different street addresses (' + ka + ' vs ' + kb + ')', flags: [] };
    }
    return { status: 'VERIFY NEXT', why: 'both establish it independently', flags: agreedFlags(a, b) };
  }
  if (a.verdict === 'unresolved' && b.verdict === 'unresolved') {
    return { status: 'UNRESOLVED', why: 'neither could establish it', flags: [] };
  }
  return { status: 'DISPUTED', why: a.verdict + ' vs ' + b.verdict, flags: [] };
}

module.exports = { MODELS, PRICES, SYSTEM, RECORD_TOOL, leadText, requestBody, extractVerdict,
                   emptyUsage, addUsage, costUSD, fableQueue, hash01, reconcile, establishes,
                   agreedFlags, streetKey, sameStop, MAX_SEARCHES, MAX_FETCHES, SEARCH_USD };
