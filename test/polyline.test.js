// Confirms HERE's reference flexible-polyline decoder (lib/flexible-polyline.js,
// vendored unmodified from github.com/heremaps/flexible-polyline) decodes HERE's
// own published test vector. Route mode is the only thing that reads this file,
// and it reads it against live HERE responses this repo cannot call — so the
// published vector is the only ground truth available. If HERE ever changes the
// format version, this fails loudly instead of quietly putting a route in the
// wrong hemisphere.
var t = require('./_assert');
var fp = require('../lib/flexible-polyline.js');

// The placeholder that shipped through 2.0.0 threw on every call and exported
// a __placeholder marker. If it ever comes back, Route mode is dead and this
// says so on the first line rather than in a browser.
t.eq(typeof fp.decode, 'function', 'decode is exported');
t.eq(typeof fp.encode, 'function', 'encode is exported - the placeholder had none');
t.eq(fp.__placeholder, undefined, 'the throwing placeholder is gone');

// Published example from the flexible-polyline README ("## Example"): these
// coordinates encode, at precision 5, to exactly this string.
var VECTOR = 'BFoz5xJ67i1B1B7PzIhaxL7Y';
var EXPECTED = [
  [50.10228, 8.69821],
  [50.10201, 8.69567],
  [50.10063, 8.69150],
  [50.09878, 8.68752]
];

var res = fp.decode(VECTOR);
t.eq(res.precision, 5, 'header: precision 5');
t.eq(res.thirdDim, fp.ABSENT, 'header: no third dimension');
t.eq(res.polyline.length, 4, 'vertex count is 4');
t.eq(JSON.stringify(res.polyline), JSON.stringify(EXPECTED),
     'decodes to the published coordinates');

// Per-vertex too, so a failure names the vertex that drifted.
EXPECTED.forEach(function(p, i){
  t.eq(res.polyline[i][0], p[0], 'vertex ' + i + ' latitude');
  t.eq(res.polyline[i][1], p[1], 'vertex ' + i + ' longitude');
});

t.eq(fp.encode({polyline: EXPECTED, precision: 5}), VECTOR,
     'round-trips back to the published string');

// lat/lng ordering, not lng/lat. The vector is Frankfurt: latitude ~50,
// longitude ~8, two values that cannot be mistaken for each other.
t.eq(res.polyline[0][0] > 49 && res.polyline[0][0] < 51, true,
     'first value is latitude ~50, not longitude ~8');
t.eq(res.polyline[0][1] > 8 && res.polyline[0][1] < 9, true,
     'second value is longitude ~8');

// HERE routing can return elevation-bearing polylines. truckRoute() in
// index.html builds its [[lat,lon],...] array by taking pt[0] and pt[1] only -
// prove that stays correct when a third dimension is present.
var WITH_3D = [
  [50.10228, 8.69821, 10],
  [50.10201, 8.69567, 20],
  [50.10063, 8.69150, 30]
];
var enc3d = fp.encode({polyline: WITH_3D, precision: 5,
                       thirdDim: fp.ELEVATION, thirdDimPrecision: 0});
var dec3d = fp.decode(enc3d);
t.eq(dec3d.thirdDim, fp.ELEVATION, 'third dim flag round-trips as ELEVATION');
t.eq(dec3d.polyline.every(function(p){ return p.length === 3; }), true,
     'each vertex carries three values');
t.eq(JSON.stringify(dec3d.polyline.map(function(p){ return [p[0], p[1]]; })),
     JSON.stringify(WITH_3D.map(function(p){ return [p[0], p[1]]; })),
     'taking [0] and [1] still yields the right lat/lon pairs');

// A cross-country truck route is thousands of vertices. Guard against
// truncation somewhere in the middle of a long decode.
var long = [];
for (var i = 0; i < 2500; i++) long.push([35 + i * 0.001, -90 - i * 0.002]);
var decLong = fp.decode(fp.encode({polyline: long, precision: 5}));
t.eq(decLong.polyline.length, 2500, '2500-vertex polyline survives a round-trip');
t.close(decLong.polyline[2499][0], long[2499][0], 1e-5, 'last vertex latitude intact');
t.close(decLong.polyline[2499][1], long[2499][1], 1e-5, 'last vertex longitude intact');

// A route crossing the equator or the prime meridian must not flip sign, and
// the US southwest is where WafflePost's own western frontier (Winnie, TX)
// sits - negative longitude, positive latitude.
var signs = [[29.83065, -94.38455], [-33.86, 151.20], [0, 0], [51.5, -0.12]];
t.eq(JSON.stringify(fp.decode(fp.encode({polyline: signs, precision: 5})).polyline),
     JSON.stringify(signs), 'mixed-sign coordinates survive a round-trip');

t.done('polyline');
