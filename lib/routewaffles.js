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
  var cum = cumulativeMiles(poly), out = [];

  (rows || []).forEach(function (row) {
    var best = null;
    for (var i = 1; i < poly.length; i++) {
      var d = segmentDistance({ lat: row.lat, lon: row.lon }, poly[i-1], poly[i]);
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

module.exports = { cumulativeMiles, projectStops, stopsAlongRoute, segmentDistance,
                   routeMiles, DETOUR_TIERS };
