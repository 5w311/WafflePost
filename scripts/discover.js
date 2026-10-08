// Discovery sweep: find Waffle Houses the corridor-by-corridor audit never
// reached, and have two models research each lead blind to one another.
//
//   node scripts/discover.js osm                      fetch OSM, build candidates
//   node scripts/discover.js osm --osm-file x.json    ...from a saved Overpass answer
//   node scripts/discover.js judge opus  --budget 40  research every candidate
//   node scripts/discover.js judge fable --budget 45  blind second pass
//   node scripts/discover.js report                   reconcile, write the report
//   node scripts/discover.js cost                     what each model has spent
//
// judge options:
//   --budget USD      REQUIRED. Hard cap for this model, across reruns. The
//                     ledger in scripts/discover-out/ persists, so stopping and
//                     restarting never resets it.
//   --dry-run         print the queue, the first prompt and a projected cost;
//                     no API calls, nothing spent
//   --limit N         judge at most N more candidates this run
//   --concurrency N   parallel requests (default 3)
//   --inside-only     only candidates with a stop inside the 0.4 mi line
//   --all             (fable) every candidate, not just Opus's non-rejects
//   --audit-share F   (fable) share of Opus rejections re-checked, default 0.25
//
// Needs ANTHROPIC_API_KEY in the environment for `judge`. Never commit it;
// unlike the HERE key this one is not domain-restricted and spends money.
//
// WHAT THIS PRODUCES IS LEADS. Nothing here writes to index.html. A pair the
// two models both establish lands in scripts/discover-report.txt as VERIFY
// NEXT, and goes through the same gate every row already passed: geocode the
// agreed address, haversine it with lib/waffledist, check it against
// satellite and Trucker Path. The 09-2026 purge happened because unverified
// research reached DATA; this script exists to make the research cheaper,
// not to skip the verification.
//
// Standalone node 18+, no dependencies, never loaded by index.html - same
// rules as remeasure.js and tsaddr-verify.js.

var fs = require('fs');
var path = require('path');
var osm = require('./discover/osm');
var cands = require('./discover/candidates');
var judge = require('./discover/judge');

var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var OUT = path.join(__dirname, 'discover-out');
var REPORT = path.join(__dirname, 'discover-report.txt');
var F = {
  osm: path.join(OUT, 'osm.json'),
  candidates: path.join(OUT, 'candidates.json'),
  ledger: path.join(OUT, 'ledger.json'),
  csv: path.join(OUT, 'review.csv'),
  judged: function (m) { return path.join(OUT, 'judged-' + m + '.jsonl'); }
};

// A first guess at the most one lead can cost, used to stop BEFORE a call
// that could overshoot the budget. Replaced by twice the running average as
// soon as there is one.
var FIRST_GUESS_USD = { opus: 0.40, fable: 1.00 };
var OVERPASS = 'https://overpass-api.de/api/interpreter';

function arg(name, dflt) {
  var i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
}
function flag(name) { return process.argv.indexOf(name) !== -1; }
function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(f, v) { fs.writeFileSync(f, JSON.stringify(v, null, 1)); }
function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function usd(n) { return '$' + n.toFixed(2); }

function loadDATA() {
  var src = fs.readFileSync(INDEX, 'utf8');
  var m = src.match(/var DATA = \[\n([\s\S]*?)\n\];/);
  if (!m) throw new Error('DATA block not found in index.html');
  return eval('[' + m[1] + ']');
}

function loadJudged(model) {
  var out = {};
  if (!fs.existsSync(F.judged(model))) return out;
  fs.readFileSync(F.judged(model), 'utf8').split('\n').forEach(function (line) {
    if (!line.trim()) return;
    try { var r = JSON.parse(line); out[r.id] = r; } catch (e) { /* torn last line */ }
  });
  return out;
}

// ---------------------------------------------------------------- osm ----
async function cmdOsm() {
  fs.mkdirSync(OUT, { recursive: true });
  var raw;
  var file = arg('--osm-file');
  if (file) {
    raw = readJSON(file, null);
    if (!raw) throw new Error('could not read ' + file);
  } else {
    console.log('querying Overpass (nationwide; this can take several minutes)...');
    var res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded',
                 'user-agent': 'WafflePost discovery sweep (wafflepost.figari.dev)' },
      body: 'data=' + encodeURIComponent(osm.overpassQuery())
    });
    if (!res.ok) {
      throw new Error('Overpass answered ' + res.status + '. It is a shared free service; ' +
        'retry later, or paste the query from `node scripts/discover.js query` into ' +
        'overpass-turbo.eu, export the JSON, and pass it with --osm-file.');
    }
    raw = await res.json();
  }
  writeJSON(F.osm, raw);
  var parsed = osm.parse(raw);
  var built = cands.build(parsed, loadDATA());
  writeJSON(F.candidates, built);
  var c = built.counts;
  console.log('Waffle Houses in OSM:            ' + c.wafflehouses);
  console.log('  with a truck-capable place:    ' + c.withTruckPlace);
  console.log('  already atlas rows:            ' + c.known);
  console.log('  NEW CANDIDATES:                ' + c.candidates +
    '  (' + built.candidates.filter(function (x) { return x.anyInsideLine; }).length + ' inside the 0.4 mi line)');
  console.log('  straight line crosses highway: ' + c.crossesHighway);
  var missing = loadDATA().length - c.known;
  if (missing > 0) {
    console.log('\n' + missing + ' atlas rows have no OSM Waffle House within ' + cands.KNOWN_FT +
      ' ft. That is OSM\'s coverage gap showing, and a measure of what this sweep can miss.');
  }
  console.log('\nwrote ' + path.relative(ROOT, F.candidates));
}

// -------------------------------------------------------------- judge ----
async function callAPI(body) {
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  for (var attempt = 0; attempt < 7; attempt++) {
    var res = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01',
                 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) return res.json();
    var text = await res.text();
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      var wait = (+res.headers.get('retry-after') || 0) * 1000 || 4000 * Math.pow(2, attempt);
      await pause(Math.min(wait, 120000));
      continue;
    }
    // 400/401/403 are configuration, not luck: a model the key cannot use,
    // web search disabled in the Console, an exhausted balance. Retrying
    // would only burn time, so the whole run stops and says why.
    var err = new Error('API ' + res.status + ': ' + text.slice(0, 500));
    err.fatal = true;
    throw err;
  }
  throw new Error('API kept failing after retries');
}

async function judgeOne(modelId, c) {
  var usage = judge.emptyUsage();
  var messages = [{ role: 'user', content: judge.leadText(c) }];
  var nudged = false, last = null;
  for (var turn = 0; turn < 8; turn++) {
    last = await callAPI(judge.requestBody(modelId, c, messages));
    judge.addUsage(usage, last.usage);
    var v = judge.extractVerdict(last.content);
    if (v) return { verdict: v, usage: usage, stop: last.stop_reason, turns: turn + 1 };
    if (last.stop_reason === 'pause_turn') {
      // A long search turn paused server-side. Send it back unchanged and
      // the API picks up where it stopped.
      messages = messages.concat([{ role: 'assistant', content: last.content }]);
      continue;
    }
    if ((last.stop_reason === 'end_turn' || last.stop_reason === 'max_tokens') && !nudged) {
      nudged = true;
      messages = messages.concat([
        { role: 'assistant', content: last.content },
        { role: 'user', content: 'Call record_verdict now with what you have established. ' +
          'Use unknown for anything you could not source.' }
      ]);
      continue;
    }
    break;
  }
  return { verdict: null, usage: usage, stop: last && last.stop_reason, turns: turn + 1,
           error: 'no record_verdict call' };
}

async function cmdJudge() {
  var which = process.argv[3];
  if (!judge.MODELS[which]) throw new Error('judge opus | judge fable');
  var model = judge.MODELS[which];
  var budget = parseFloat(arg('--budget'));
  var dry = flag('--dry-run');
  if (!(budget > 0) && !dry) throw new Error('--budget USD is required, e.g. --budget 40');

  var built = readJSON(F.candidates, null);
  if (!built) throw new Error('no candidates yet - run `node scripts/discover.js osm` first');
  var queue = built.candidates;
  if (flag('--inside-only')) queue = queue.filter(function (c) { return c.anyInsideLine; });
  if (which === 'fable') {
    var share = arg('--audit-share');
    queue = judge.fableQueue(queue, loadJudged('opus'),
      { all: flag('--all'), auditShare: share == null ? undefined : parseFloat(share) });
  }
  var done = loadJudged(which);
  queue = queue.filter(function (c) { return !(done[c.id] && done[c.id].verdict); });
  var limit = parseInt(arg('--limit', '0'), 10);
  if (limit > 0) queue = queue.slice(0, limit);

  var ledger = readJSON(F.ledger, {});
  var spent = (ledger[which] || {}).usd || 0;
  var runs = (ledger[which] || {}).leads || 0;
  var avg = runs ? spent / runs : FIRST_GUESS_USD[which];

  console.log(model.label + ': ' + queue.length + ' leads queued, ' + usd(spent) + ' spent so far' +
    (budget > 0 ? ' of ' + usd(budget) : ''));
  console.log('projected for this queue: about ' + usd(avg * queue.length) +
    ' (' + usd(avg) + ' per lead, ' + (runs ? 'measured over ' + runs : 'first guess') + ')');

  if (dry) {
    if (queue[0]) {
      console.log('\n--- system prompt ---\n' + judge.SYSTEM + '\n\n--- first lead ---\n' + judge.leadText(queue[0]));
    }
    return;
  }

  var conc = Math.max(1, parseInt(arg('--concurrency', '3'), 10));
  var next = 0, stopped = null, inFlight = 0;
  fs.mkdirSync(OUT, { recursive: true });

  async function worker() {
    while (!stopped && next < queue.length) {
      // Reserve twice the average for every request already in flight plus
      // this one, so concurrency cannot carry the run past the cap.
      var reserve = 2 * Math.max(avg, FIRST_GUESS_USD[which] / 2) * (inFlight + 1);
      if (spent + reserve > budget) { stopped = stopped || 'budget'; break; }
      var c = queue[next++];
      inFlight++;
      var rec = { id: c.id, model: model.id, at: new Date().toISOString() };
      try {
        var r = await judgeOne(model.id, c);
        rec.verdict = r.verdict; rec.usage = r.usage; rec.stop = r.stop; rec.turns = r.turns;
        if (r.error) rec.error = r.error;
        rec.usd = judge.costUSD(model.id, r.usage);
      } catch (e) {
        rec.error = e.message;
        rec.usd = 0;
        if (e.fatal) stopped = e.message;
      }
      inFlight--;
      spent += rec.usd;
      if (rec.verdict) runs++;
      avg = runs ? spent / runs : avg;
      ledger[which] = { usd: spent, leads: runs, model: model.id };
      writeJSON(F.ledger, ledger);
      fs.appendFileSync(F.judged(which), JSON.stringify(rec) + '\n');
      var tag = rec.verdict ? rec.verdict.verdict.toUpperCase() : 'ERROR';
      console.log('[' + usd(spent) + '] ' + tag + '  ' + c.id + '  ' +
        (rec.verdict ? [rec.verdict.corridor, rec.verdict.exit, rec.verdict.exit_name, rec.verdict.state]
          .filter(Boolean).join(' ') : rec.error));
    }
  }
  var ws = [];
  for (var i = 0; i < conc; i++) ws.push(worker());
  await Promise.all(ws);
  console.log('\n' + model.label + ' done: ' + usd(spent) + ' spent' +
    (stopped === 'budget' ? ' - stopped at the budget cap with ' + (queue.length - next) + ' left' :
     stopped ? ' - STOPPED: ' + stopped : ''));
}

// ------------------------------------------------------------- report ----
function csvField(v) {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function cmdReport() {
  var built = readJSON(F.candidates, null);
  if (!built) throw new Error('no candidates yet');
  var o = loadJudged('opus'), f = loadJudged('fable');
  var ledger = readJSON(F.ledger, {});
  var groups = { 'VERIFY NEXT': [], 'DISPUTED': [], 'ONE MODEL': [], 'UNRESOLVED': [], 'REJECTED': [] };
  var rows = [];

  built.candidates.forEach(function (c) {
    var a = o[c.id] && o[c.id].verdict, b = f[c.id] && f[c.id].verdict;
    if (!a && !b) return;                       // never judged: not in the report
    var r = judge.reconcile(a, b);
    groups[r.status].push({ c: c, a: a, b: b, r: r });
    var v = a || b, ts = v.truck_stop || {};
    var stop = c.stops.filter(function (s) { return s.osmId === ts.osm_id; })[0] || c.stops[0];
    rows.push([c.id, r.status, r.why, v.corridor, v.exit, v.exit_name, v.state,
      (v.waffle_house || {}).address, ts.operator_name, ts.address, stop.osmFeet,
      stop.crosses.map(function (x) { return x.label; }).join(' '), (r.flags || []).join(' '),
      a ? a.verdict : '', b ? b.verdict : '', a ? a.caution : '', b ? b.caution : '']);
  });

  var L = [];
  L.push('WafflePost discovery report - ' + new Date().toISOString().slice(0, 10));
  L.push('Generated by scripts/discover.js. LEADS, NOT ROWS: nothing below is in DATA.');
  L.push('');
  L.push('Spend: Opus 5.5 ' + usd((ledger.opus || {}).usd || 0) + ' over ' + ((ledger.opus || {}).leads || 0) +
    ' leads, Fable 5.1 ' + usd((ledger.fable || {}).usd || 0) + ' over ' + ((ledger.fable || {}).leads || 0) + ' leads.');
  L.push('OSM: ' + built.counts.wafflehouses + ' Waffle Houses, ' + built.counts.candidates +
    ' new candidates, ' + built.counts.known + ' already atlas rows.');
  L.push('');
  L.push('"osm ft" is a straight line between two OpenStreetMap pins. It is a lead for');
  L.push('sorting, NOT a measurement, and must never be copied into `feet`. Re-derive it');
  L.push('from the agreed truck stop address the way scripts/remeasure.js does.');
  L.push('');
  Object.keys(groups).forEach(function (status) {
    var g = groups[status];
    L.push('==== ' + status + ' (' + g.length + ') ' + '='.repeat(Math.max(0, 60 - status.length)));
    g.sort(function (x, y) { return x.c.nearestFeet - y.c.nearestFeet; });
    g.forEach(function (e) {
      var v = e.a || e.b;
      L.push('');
      L.push([v.corridor || '?', 'exit ' + (v.exit || '?'), v.exit_name, v.state].filter(Boolean).join('  ') +
        '   [' + e.c.id + ']   ' + e.r.why);
      L.push('  Waffle House: ' + ((v.waffle_house || {}).address || e.c.wafflehouse.address || '(no address)') +
        '   ' + e.c.wafflehouse.lat.toFixed(5) + ',' + e.c.wafflehouse.lon.toFixed(5));
      e.c.stops.slice(0, 4).forEach(function (s) {
        L.push('  stop: ' + s.name + '  osm ft ' + s.osmFeet + (s.insideLine ? '' : ' (past the line)') +
          (s.crosses.length ? '  CROSSES ' + s.crosses.map(function (x) { return x.label; }).join(', ') : ''));
      });
      [['Opus ', e.a], ['Fable', e.b]].forEach(function (p) {
        var x = p[1];
        if (!x) { L.push('  ' + p[0] + ': (not judged)'); return; }
        var t = x.truck_stop;
        L.push('  ' + p[0] + ': ' + x.verdict + (x.verdict === 'reject' ? ' (' + x.reject_reason + ')' : '') +
          ' | WH ' + x.waffle_house.operating + '/' + x.waffle_house.service +
          ' | ' + (t.operator_name || '?') + ' ' + t.operating + ', semis ' + t.semi_parking +
          ', overnight ' + t.overnight + ', ' + t.parking_cost + ', scale ' + t.cat_scale +
          ' | same exit ' + x.same_interchange + ', crosses ' + x.walk_crosses_highway);
        if (t.address) L.push('         stop address: ' + t.address);
        if (x.crossing_detail) L.push('         crossing: ' + x.crossing_detail);
        if (x.caution) L.push('         CAUTION: ' + x.caution);
        if (x.note_draft) L.push('         note: ' + x.note_draft);
        var ev = (t.evidence || []).concat(x.waffle_house.evidence || [], x.driver_walk_evidence || []);
        ev.slice(0, 6).forEach(function (s) { L.push('         - ' + s.claim + '  <' + s.url + '>'); });
        (x.open_questions || []).forEach(function (q) { L.push('         ? ' + q); });
      });
      if (e.r.flags && e.r.flags.length) L.push('  flags both agree on: ' + e.r.flags.join(', '));
    });
    L.push('');
  });
  fs.writeFileSync(REPORT, L.join('\n') + '\n');

  var header = ['osm_id', 'status', 'why', 'corridor', 'exit', 'exit_name', 'state', 'wh_address',
    'truck_stop', 'ts_address', 'osm_ft_NOT_A_MEASUREMENT', 'crosses', 'agreed_flags',
    'opus', 'fable', 'opus_caution', 'fable_caution'];
  fs.writeFileSync(F.csv, [header].concat(rows).map(function (r) { return r.map(csvField).join(','); }).join('\n') + '\n');

  Object.keys(groups).forEach(function (s) { console.log(s + ': ' + groups[s].length); });
  console.log('\nwrote ' + path.relative(ROOT, REPORT) + ' and ' + path.relative(ROOT, F.csv));
}

function cmdCost() {
  var ledger = readJSON(F.ledger, {});
  ['opus', 'fable'].forEach(function (m) {
    var l = ledger[m] || {};
    console.log(judge.MODELS[m].label + ': ' + usd(l.usd || 0) + ' over ' + (l.leads || 0) + ' leads' +
      (l.leads ? ', ' + usd(l.usd / l.leads) + ' each' : ''));
  });
}

var cmd = process.argv[2];
var run = { osm: cmdOsm, judge: cmdJudge, report: cmdReport, cost: cmdCost,
            query: function () { console.log(osm.overpassQuery()); } }[cmd];
if (!run) {
  console.log('usage: node scripts/discover.js osm | query | judge opus|fable --budget USD | report | cost');
  process.exit(1);
}
Promise.resolve().then(run).catch(function (e) { console.error(e.message); process.exit(1); });
