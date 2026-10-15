// scripts/discover: the offline half - OSM parsing, candidate building, the
// crossing test, the verdict shape, cost arithmetic and reconciliation. The
// network half (Overpass, the Messages API) is not testable here and is not
// pretended to be.
var t = require('./_assert');
var osm = require('../scripts/discover/osm');
var cd = require('../scripts/discover/candidates');
var jd = require('../scripts/discover/judge');

// --- truck classification ------------------------------------------------
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'Pilot' }), 'truck', 'Pilot brand is a truck stop');
t.eq(cd.truckClass({ amenity: 'fuel', brand: "Love's" }), 'truck', "Love's brand is a truck stop");
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'TA' }), 'truck', 'exact TA brand counts');
t.eq(cd.truckClass({ amenity: 'fuel', name: 'Tasty Mart' }), 'car', 'a name starting "Ta" is not TA');
t.eq(cd.truckClass({ amenity: 'fuel', name: "Jack's Truck Stop" }), 'truck', 'truck stop in the name');
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'Pilot', hgv: 'no' }), 'car', 'hgv=no outranks a truck brand');
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'Shell', hgv: 'yes' }), 'truck', 'hgv=yes makes any fuel a truck stop');
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'QuikTrip' }), 'maybe', 'QuikTrip is for the judge to settle');
t.eq(cd.truckClass({ amenity: 'fuel', brand: 'Shell' }), 'car', 'an untagged Shell is a car station');
t.eq(cd.truckClass({ amenity: 'fuel', name: 'Petro Express' }), 'car', 'Petro Express is not Petro');
t.eq(cd.truckClass({ amenity: 'fuel', name: 'Petro Stopping Center' }), 'truck', 'Petro still is');
t.eq(cd.truckClass({ amenity: 'parking' }), 'car', 'a parking lot with no hgv tag is not truck parking');

// --- OSM parse -----------------------------------------------------------
var raw = { elements: [
  { type: 'node', id: 1, lat: 34.0, lon: -84.0, tags: { name: 'Waffle House', 'brand:wikidata': 'Q1701206' } },
  { type: 'node', id: 1, lat: 34.0, lon: -84.0, tags: { name: 'Waffle House' } },          // dupe
  { type: 'way', id: 2, center: { lat: 34.0010, lon: -84.0 }, tags: { amenity: 'fuel', brand: 'Pilot', name: 'Pilot' } },
  { type: 'node', id: 3, lat: 34.0011, lon: -84.0001, tags: { amenity: 'fuel', brand: 'Pilot', name: 'Pilot', hgv: 'yes' } },
  { type: 'node', id: 4, lat: 34.0005, lon: -84.0005, tags: { amenity: 'fuel', brand: 'Shell' } },
  { type: 'way', id: 9, tags: { highway: 'motorway', ref: 'I-75' },
    geometry: [{ lat: 34.003, lon: -84.01 }, { lat: 34.003, lon: -83.99 }] },
  { type: 'node', id: 5, tags: { amenity: 'fuel' } }                                       // no coordinate
] };
var p = osm.parse(raw);
t.eq(p.wafflehouses.length, 1, 'one Waffle House, duplicate dropped');
t.eq(p.places.length, 3, 'three places with coordinates');
t.eq(p.roads.length, 1, 'one motorway with geometry');
t.eq(osm.overpassQuery().indexOf('around.wh:800') !== -1, true, 'query searches 800 m around each store');

// --- crossing ------------------------------------------------------------
var wh = { lat: 34.0, lon: -84.0 };
var road = [{ id: 'way/9', highway: 'motorway', ref: 'I-75',
              line: [{ lat: 34.003, lon: -84.01 }, { lat: 34.003, lon: -83.99 }] }];
t.eq(cd.roadsCrossed(wh, { lat: 34.006, lon: -84.0 }, road).length, 1, 'a stop across the interstate is flagged');
t.eq(cd.roadsCrossed(wh, { lat: 34.001, lon: -84.0 }, road).length, 0, 'a same-side stop is not');
var twoCarriageways = road.concat([{ id: 'way/10', highway: 'motorway', ref: 'I-75',
  line: [{ lat: 34.0035, lon: -84.01 }, { lat: 34.0035, lon: -83.99 }] }]);
t.eq(cd.roadsCrossed(wh, { lat: 34.006, lon: -84.0 }, twoCarriageways).length, 1,
  'both carriageways of one interstate report once');

// --- build ---------------------------------------------------------------
var parsed = { wafflehouses: p.wafflehouses, roads: road, places: p.places };
var b = cd.build(parsed, []);
t.eq(b.candidates.length, 1, 'one candidate');
t.eq(b.candidates[0].stops.length, 1, 'node and lot way of one Pilot merge; the Shell is excluded');
t.eq(b.candidates[0].stops[0].tags.hgv, 'yes', 'merge keeps the better-tagged object');
t.close(b.candidates[0].nearestFeet, 400, 60, 'osmFeet is the haversine between the pins');
t.eq('feet' in b.candidates[0].stops[0], false, 'candidates never carry a `feet` field');
var known = cd.build(parsed, [{ lat: 34.0002, lon: -84.0, city: 'Testville', state: 'GA', exit: '1', corridor: 'I-75' }]);
t.eq(known.candidates.length, 0, 'a store within 600 ft of an atlas row is not new');
t.eq(known.known[0].knownRow.city, 'Testville', 'and is reported against that row');
var far = cd.build({ wafflehouses: p.wafflehouses, roads: [], places:
  [{ id: 'node/8', lat: 34.02, lon: -84.0, tags: { amenity: 'fuel', brand: 'Pilot' } }] }, []);
t.eq(far.candidates.length, 0, 'a truck stop 1.4 mi away is no candidate');

var mixed = cd.build({ roads: [], wafflehouses: [{ id: 'node/a', lat: 30, lon: -90, tags: {} },
    { id: 'node/b', lat: 31, lon: -90, tags: {} }, { id: 'node/c', lat: 32, lon: -90, tags: {} }],
  places: [{ id: 'node/qt', lat: 30.0003, lon: -90, tags: { amenity: 'fuel', brand: 'QuikTrip' } },
    { id: 'node/pl', lat: 31.0015, lon: -90, tags: { amenity: 'fuel', brand: 'Pilot' } },
    { id: 'node/lv', lat: 32.0065, lon: -90, tags: { amenity: 'fuel', brand: "Love's" } }] }, []);
t.eq(mixed.candidates.map(function (c) { return c.id + ':' + c.priority; }).join(' '),
  'node/b:0 node/a:1 node/c:2', 'a truck stop inside the line outranks a closer QuikTrip; past the line is last');

// --- the prompt ----------------------------------------------------------
var lead = jd.leadText(b.candidates[0]);
t.eq(/\d+\s*ft/.test(lead), false, 'the lead never shows the model a distance');
t.eq(/NEVER estimate/.test(jd.SYSTEM), true, 'system prompt forbids estimating distance');
t.eq(JSON.stringify(jd.RECORD_TOOL).indexOf('feet'), -1, 'the verdict schema has nowhere to put feet');
var body = jd.requestBody('claude-opus-5-5', b.candidates[0]);
t.eq(body.tools.map(function (x) { return x.name; }).join(','), 'web_search,web_fetch,record_verdict', 'three tools');
t.eq(body.system[0].cache_control.type, 'ephemeral', 'the shared system prompt is cached');

// --- verdict extraction and cost -----------------------------------------
t.eq(jd.extractVerdict([{ type: 'text', text: 'x' }]), null, 'no tool call, no verdict');
t.eq(jd.extractVerdict([{ type: 'tool_use', name: 'record_verdict', input: { verdict: 'reject' } }]).verdict,
  'reject', 'verdict comes from the record_verdict input');
var u = jd.addUsage(jd.emptyUsage(), { input_tokens: 1e6, output_tokens: 1e5, cache_read_input_tokens: 1e6,
  cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 10 } });
t.close(jd.costUSD('claude-opus-5-5', u), 4 + 2 + 0.20 + 0.10, 1e-9, 'Opus 5.5 cost arithmetic');
t.close(jd.costUSD('claude-fable-5-1', u), 10 + 5 + 0.25 + 0.10, 1e-9, 'Fable 5.1 cost arithmetic');
var threw = false;
try { jd.costUSD('claude-unknown', u); } catch (e) { threw = true; }
t.eq(threw, true, 'an unpriced model refuses to be costed');

// --- fable queue ---------------------------------------------------------
var cs = []; for (var i = 0; i < 400; i++) cs.push({ id: 'node/' + i });
var opusR = {}; cs.forEach(function (c, i) {
  opusR[c.id] = { verdict: { verdict: i < 100 ? 'candidate' : 'reject' } };
});
var q = jd.fableQueue(cs, opusR, { auditShare: 0.25 });
var rejectsSent = q.filter(function (c) { return opusR[c.id].verdict.verdict === 'reject'; }).length;
t.eq(q.length - rejectsSent, 100, 'every Opus non-reject goes to Fable');
t.eq(rejectsSent > 45 && rejectsSent < 105, true, 'about a quarter of Opus rejects are audited (' + rejectsSent + ')');
t.eq(jd.fableQueue(cs, opusR, { auditShare: 0.25 }).length, q.length, 'the audit sample is stable across reruns');
t.eq(jd.fableQueue(cs, opusR, { all: true }).length, 400, '--all sends everything');
t.eq(jd.fableQueue([{ id: 'x' }], {}, {}).length, 0, 'a lead Opus never reached is not Fable\'s');
t.eq(jd.fableQueue([{ id: 'x' }], { x: { error: 'API 500' } }, {}).length, 1, 'a lead Opus errored on goes to Fable');

// --- reconcile -----------------------------------------------------------
function v(over) {
  var base = { verdict: 'candidate', reject_reason: 'none', same_interchange: 'yes',
    waffle_house: { operating: 'yes', service: 'full', address: '', evidence: [] },
    truck_stop: { osm_id: 'node/3', operator_name: 'Pilot #123', operating: 'yes', semi_parking: 'yes',
      overnight: 'allowed', parking_cost: 'free', cat_scale: 'yes', sit_down_restaurant: 'no',
      address: '2209 Highway 71, Marianna, FL', evidence: [{ claim: 'x', url: 'u' }] } };
  var o = JSON.parse(JSON.stringify(base));
  Object.keys(over || {}).forEach(function (k) {
    if (typeof over[k] === 'object') Object.assign(o[k], over[k]); else o[k] = over[k];
  });
  return o;
}
t.eq(jd.reconcile(v(), v()).status, 'VERIFY NEXT', 'two independent establishments');
t.eq(jd.reconcile(v(), v()).flags.join(','), 'free,scale', 'only flags both agree on');
t.eq(jd.reconcile(v(), v({ truck_stop: { cat_scale: 'unknown' } })).flags.join(','), 'free',
  'unknown is not agreement');
t.eq(jd.reconcile(v(), v({ truck_stop: { osm_id: 'node/77' } })).status, 'DISPUTED', 'different stops');
t.eq(jd.reconcile(v(), v({ truck_stop: { address: '2215 Highway 71, Marianna, FL' } })).status, 'DISPUTED',
  'same stop, different house numbers');
t.eq(jd.reconcile(v(), v({ verdict: 'reject', reject_reason: 'different_interchange' })).status, 'DISPUTED',
  'candidate vs reject');
t.eq(jd.reconcile(v({ verdict: 'reject' }), v({ verdict: 'reject' })).status, 'REJECTED', 'both reject');
t.eq(jd.reconcile(v(), null).status, 'ONE MODEL', 'one verdict is not agreement');
t.eq(jd.reconcile(v(), v({ same_interchange: 'unknown' })).status, 'DISPUTED',
  'a candidate that did not establish the interchange does not count');
t.eq(jd.reconcile(v(), v({ truck_stop: { evidence: [] } })).status, 'DISPUTED',
  'a candidate with no truck stop source does not count');

t.done('discover');
