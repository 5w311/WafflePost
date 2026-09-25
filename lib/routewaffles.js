// Projects atlas rows onto a decoded route polyline: which walkable pairs are
// on this run, at what mile, and how far off the road. No DOM, no network.
//
// The polyline is [[lat,lon],...] as HERE's flexible-polyline decoder returns
// it. This file never fetches anything - hand it a decoded route.

var haversine = require('./waffledist').haversine;

// Detour tiers are deliberately much tighter than FuelPost's [8,15,30,50].
// Nobody drives 30 miles off route for hashbrowns. If a pair is not within a
// few miles of the road it is not on this run, and saying so is more useful
// than widening until something turns up.
var DETOUR_TIERS = [1, 3, 6];

function cumulativeMiles(poly) {
  var out = [0];
  for (var i = 1; i < poly.length; i++) {
    out.push(out[i - 1] + haversine({ lat: poly[i-1][0], lon: poly[i-1][1] },
                                    { lat: poly[i][0],   lon: poly[i][1] }));
  }
  return out;
}

// Point-to-segment distance on a local equirectangular projection: longitude
// is scaled by cos(lat) so a degree east and a degree north compare like with
// like. Good to well under a percent at segment lengths a route polyline
// actually uses, and it avoids the great-circle cross-track edge cases that
// are hard to test and buy nothing at this scale.
function segmentDistance(p, a, b) {
  var R = 3958.8, rad = Math.PI / 180;
  var latRef = (a[0] + b[0]) / 2 * rad;
  var k = Math.cos(latRef);
  var px = (p.lon - a[1]) * k, py = p.lat - a[0];
  var bx = (b[1] - a[1]) * k,  by = b[0] - a[0];
  var len2 = bx * bx + by * by;
  var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  var dx = px - t * bx, dy = py - t * by;
  return { miles: Math.sqrt(dx * dx + dy * dy) * rad * R, t: t };
}

// For each row, the closest approach of the route and the mile along the
// route where that happens.
function projectStops(poly, rows, maxDetourMi) {
  if (!poly || poly.length < 2) return [];
  var cum = cumulativeMiles(poly), out = [], rad = Math.PI / 180;

  /* A segment whose bounding box is further than maxDetourMi from the row
     cannot produce an emitted stop, so it is skipped before the distance
     maths. 67 rows against ~8,000 segments is half a million segmentDistance
     calls per route, and alternative routes multiply that by the number of
     options - measured about 3x faster (roughly 150ms down to 47ms) across
     five cross-country-scale routes, with output verified identical to the
     brute-force version across 507 differential comparisons including
     nearest-approach ties, zero-length segments and polar latitudes.
     Both pads are deliberately too generous rather than too tight: 69 miles
     per degree of latitude where the real figure is 69.05, and a cosine taken
     a full degree further from the equator than the row sits. The box can
     only ever be larger than it needs to be, so a segment that could hold the
     nearest approach is never skipped - and since every skipped segment is by
     construction further than maxDetourMi, the surviving minimum is still the
     true one whenever the row is close enough to be emitted at all. */
  var latPad = maxDetourMi / 69;

  (rows || []).forEach(function (row) {
    var lonPad = latPad / Math.max(0.01, Math.cos((Math.abs(row.lat) + 1) * rad));
    var best = null;
    for (var i = 1; i < poly.length; i++) {
      var a = poly[i-1], b = poly[i];
      var loLat = a[0] < b[0] ? a[0] : b[0], hiLat = a[0] < b[0] ? b[0] : a[0];
      if (row.lat < loLat - latPad || row.lat > hiLat + latPad) continue;
      var loLon = a[1] < b[1] ? a[1] : b[1], hiLon = a[1] < b[1] ? b[1] : a[1];
      if (row.lon < loLon - lonPad || row.lon > hiLon + lonPad) continue;
      var d = segmentDistance({ lat: row.lat, lon: row.lon }, a, b);
      if (!best || d.miles < best.miles) {
        var segLen = cum[i] - cum[i - 1];
        best = { miles: d.miles, routeMile: cum[i - 1] + d.t * segLen };
      }
    }
    if (best && best.miles <= maxDetourMi) {
      out.push({ row: row, detourMi: best.miles, routeMile: best.routeMile });
    }
  });

  out.sort(function (x, y) { return x.routeMile - y.routeMile; });
  return out;
}

// Tries the tight tier first and only widens if the tight search found
// nothing at all. A run with three pairs within a mile should never have its
// list padded out with stops six miles off the road.
function stopsAlongRoute(poly, rows, tiers) {
  var list = tiers || DETOUR_TIERS;
  for (var i = 0; i < list.length; i++) {
    var found = projectStops(poly, rows, list[i]);
    if (found.length) return { stops: found, tierUsed: list[i], widened: i > 0 };
  }
  return { stops: [], tierUsed: list[list.length - 1], widened: list.length > 1 };
}

function routeMiles(poly) {
  var c = cumulativeMiles(poly || []);
  return c.length ? c[c.length - 1] : 0;
}

// A DRY STRETCH is a run of road with no walkable pair on it: the miles
// between two consecutive stops, or from the start to the first, or from the
// last to the end. The route list shows one as its own row, so a driver
// planning when to eat can see "265 miles with no walkable stop" before
// passing the last chance rather than after.
//
// `stops` must be in route order - which is what projectStops returns, and
// what the route list renders. `before` is the index in `stops` the stretch
// sits in front of: 0 is ahead of the first stop, stops.length is after the
// last. Taking the caller's own indices is deliberate; sorting a copy here
// would hand back positions that no longer match the list being rendered.
//
// 150 miles is about two and a half hours at the wheel. Shorter than that is
// not worth a row - the Gulf coast on I-10 has stops every thirty to eighty
// miles and would sprout noise between every pair. Measured against the
// 13-2026 atlas, Dallas to Orlando by I-49 shows exactly one: the 265 miles
// from Marshall TX to Henderson LA.
var DRY_STRETCH_MI = 150;

function dryStretches(stops, totalMiles, minMiles) {
  var min = (minMiles == null) ? DRY_STRETCH_MI : minMiles;
  var marks = [0];
  (stops || []).forEach(function (s) { marks.push(s.routeMile); });
  marks.push(totalMiles);
  var out = [];
  for (var i = 1; i < marks.length; i++) {
    var gap = marks[i] - marks[i - 1];
    if (gap >= min) out.push({ before: i - 1, fromMile: marks[i - 1], toMile: marks[i], miles: gap });
  }
  return out;
}

module.exports = { cumulativeMiles, projectStops, stopsAlongRoute, segmentDistance,
                   routeMiles, DETOUR_TIERS, dryStretches, DRY_STRETCH_MI };
