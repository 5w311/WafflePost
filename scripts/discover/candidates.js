// Turns parsed OSM elements into discovery candidates: one Waffle House, the
// truck-capable places near it, the straight-line distance to each, and
// whether that straight line crosses an interstate. Pure, offline, tested in
// test/discover.test.js.
//
// The distance here is a LEAD, not a figure. It is a haversine between two OSM
// coordinates, computed with the app's own lib/waffledist so it is at least
// the same arithmetic. The atlas only accepts `feet` re-derived from an
// audited coordinate (scripts/remeasure.js), and nothing in this file is
// allowed to pretend otherwise: candidates carry `osmFeet`, never `feet`.

var wd = require('../../lib/waffledist');

var MAX_FT = 2625;        // matches osm.js AROUND_M; past the line on purpose
var KNOWN_FT = 600;       // a Waffle House this close to a row IS that row
var MERGE_FT = 500;       // two OSM objects for one business (node + lot way)

// Truck stop chains that mean semi parking when the brand tag says so. A
// brand being on this list is evidence, not proof - a small Pilot can be a
// car-only travel store - and the judging pass is told to check.
var TRUCK_BRANDS = [
  'pilot', 'flying j', "love's", 'loves', 'ta', 'travelcenters of america',
  'ta express', 'petro', 'petro stopping center', 'sapp bros', "roady's",
  'roadys', 'ambest', 'bosselman', 'one9', 'speedco', 'kenly 95', 'road ranger',
  'boss shop', 'rip griffin', 'fuel mart', 'jubitz', "sapp bros."
];

// Large-format stores that sometimes park trucks and sometimes forbid them.
// Oak Grove MO's QuikTrip parks them; the Ennis Buc-ee's does not (see the
// README's I-45 notes). These become candidates flagged for the judge to
// settle, never assumed either way.
var MAYBE_BRANDS = ['quiktrip', 'qt', 'racetrac', 'raceway', "buc-ee's", 'bucees', 'wawa', 'sheetz'];

var TRUCK_NAME = /\b(truck ?stop|truck ?plaza|travel ?plaza|travel ?cent(er|re)|truck ?cent(er|re)|truckers?)\b/i;

function lc(s) { return String(s || '').toLowerCase().trim(); }

function displayName(tags) {
  tags = tags || {};
  return tags.name || tags.brand || tags.operator || '(unnamed)';
}

// 'truck' | 'maybe' | 'car'. Explicit hgv tagging outranks everything,
// including a truck brand: a mapper who wrote hgv=no stood in that lot.
function truckClass(tags) {
  tags = tags || {};
  var hgv = lc(tags.hgv);
  if (hgv === 'no') return 'car';
  if (hgv === 'yes' || hgv === 'designated') return 'truck';
  if (tags.amenity === 'parking') return hgv ? 'maybe' : 'car';
  var brand = lc(tags.brand), name = lc(tags.name), op = lc(tags.operator);
  if (TRUCK_BRANDS.indexOf(brand) !== -1 || TRUCK_BRANDS.indexOf(op) !== -1) return 'truck';
  if (TRUCK_NAME.test(tags.name || '')) return 'truck';
  for (var i = 0; i < TRUCK_BRANDS.length; i++) {
    // TA is two letters; only an exact brand/name may claim it.
    if (TRUCK_BRANDS[i].length > 2 && name.indexOf(TRUCK_BRANDS[i]) === 0) return 'truck';
  }
  if (tags.highway === 'services') return 'maybe';
  if (MAYBE_BRANDS.indexOf(brand) !== -1 || MAYBE_BRANDS.indexOf(name) !== -1) return 'maybe';
  return 'car';
}

function feetBetween(a, b) {
  var mi = wd.haversine(a, b);
  return mi === null ? null : Math.round(mi * wd.FT_PER_MI);
}

// Local flat projection in feet around a reference point. Over a few
// thousand feet the error is far below anything a lot boundary cares about.
function project(p, ref) {
  var ftPerDegLat = 364000;
  var ftPerDegLon = ftPerDegLat * Math.cos(ref.lat * Math.PI / 180);
  return { x: (p.lon - ref.lon) * ftPerDegLon, y: (p.lat - ref.lat) * ftPerDegLat };
}

function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }

// Proper intersection only. A road that merely touches an endpoint is the
// frontage the store sits on, not something between the two doors.
function segmentsCross(p1, p2, q1, q2) {
  var d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2);
  var d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Which motorway/trunk carriageways does the straight line from a to b
// cross? Returns their refs (or ids), deduplicated. An interstate drawn as
// two carriageways is crossed twice and reported once.
function roadsCrossed(a, b, roads) {
  var ref = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  var pa = project(a, ref), pb = project(b, ref);
  var hit = {}, list = [];
  (roads || []).forEach(function (r) {
    var line = r.line || [];
    for (var i = 1; i < line.length; i++) {
      if (segmentsCross(pa, pb, project(line[i - 1], ref), project(line[i], ref))) {
        var label = (r.highway === 'motorway' ? '' : 'trunk ') + (r.ref || r.id);
        if (!hit[label]) { hit[label] = 1; list.push({ label: label, highway: r.highway }); }
        break;
      }
    }
  });
  return list;
}

function knownRow(wh, data) {
  var best = null;
  (data || []).forEach(function (row) {
    var ft = feetBetween(wh, { lat: row.lat, lon: row.lon });
    if (ft !== null && ft <= KNOWN_FT && (!best || ft < best.ft)) {
      best = { ft: ft, city: row.city, state: row.state, exit: row.exit, corridor: row.corridor };
    }
  });
  return best;
}

// Collapse a fuel node and the lot way drawn around the same business.
function mergePlaces(list) {
  var kept = [];
  list.forEach(function (p) {
    var dupe = kept.filter(function (k) {
      return lc(displayName(k.tags)) === lc(displayName(p.tags)) &&
             feetBetween(k, p) <= MERGE_FT;
    })[0];
    if (!dupe) { kept.push(p); return; }
    // keep whichever carries more tags; it is the better-mapped object
    if (Object.keys(p.tags || {}).length > Object.keys(dupe.tags || {}).length) {
      kept[kept.indexOf(dupe)] = p;
    }
  });
  return kept;
}

function addressOf(tags) {
  tags = tags || {};
  var street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  var tail = [tags['addr:city'], [tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  return [street, tail].filter(Boolean).join(', ');
}

// osm: the output of osm.parse. data: index.html's DATA array.
// Returns { candidates, known, counts }. A Waffle House with no truck-capable
// place inside MAX_FT is not a candidate and is only counted.
function build(osm, data, opts) {
  opts = opts || {};
  var maxFt = opts.maxFt || MAX_FT;
  var candidates = [], known = [];
  var counts = { wafflehouses: 0, withTruckPlace: 0, known: 0, candidates: 0, crossesHighway: 0 };
  var capable = (osm.places || []).filter(function (p) { return truckClass(p.tags) !== 'car'; });

  (osm.wafflehouses || []).forEach(function (wh) {
    counts.wafflehouses++;
    var near = mergePlaces(capable.filter(function (p) {
      var ft = feetBetween(wh, p);
      return ft !== null && ft <= maxFt;
    }));
    if (!near.length) return;
    counts.withTruckPlace++;

    var stops = near.map(function (p) {
      var crossed = roadsCrossed(wh, p, osm.roads);
      return {
        osmId: p.id, name: displayName(p.tags), brand: p.tags.brand || '',
        truckClass: truckClass(p.tags), lat: p.lat, lon: p.lon,
        osmFeet: feetBetween(wh, p),
        insideLine: feetBetween(wh, p) <= wd.WALKABLE_FT,
        crosses: crossed, address: addressOf(p.tags),
        tags: pick(p.tags, ['hgv', 'amenity', 'highway', 'brand', 'operator', 'name',
                            'opening_hours', 'website', 'phone', 'fee', 'capacity:hgv'])
      };
    }).sort(function (a, b) { return a.osmFeet - b.osmFeet; });

    var cand = {
      id: wh.id,
      wafflehouse: {
        osmId: wh.id, lat: wh.lat, lon: wh.lon, address: addressOf(wh.tags),
        tags: pick(wh.tags, ['name', 'brand', 'opening_hours', 'phone', 'website',
                             'addr:city', 'addr:state', 'disused:amenity'])
      },
      stops: stops,
      nearestFeet: stops[0].osmFeet,
      anyInsideLine: stops.some(function (s) { return s.insideLine; }),
      crossesHighway: stops.some(function (s) { return s.crosses.length > 0; })
    };

    var k = knownRow(wh, data);
    if (k) { counts.known++; cand.knownRow = k; known.push(cand); return; }
    counts.candidates++;
    if (cand.crossesHighway) counts.crossesHighway++;
    candidates.push(cand);
  });

  // Inside-the-line first, then shortest walk - the order the atlas reads in.
  candidates.sort(function (a, b) {
    if (a.anyInsideLine !== b.anyInsideLine) return a.anyInsideLine ? -1 : 1;
    return a.nearestFeet - b.nearestFeet;
  });
  return { candidates: candidates, known: known, counts: counts };
}

function pick(obj, keys) {
  var out = {};
  keys.forEach(function (k) { if (obj && obj[k] != null && obj[k] !== '') out[k] = obj[k]; });
  return out;
}

module.exports = { build, truckClass, roadsCrossed, segmentsCross, knownRow, mergePlaces,
                   feetBetween, addressOf, MAX_FT, KNOWN_FT, TRUCK_BRANDS, MAYBE_BRANDS };
