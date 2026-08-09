var t = require('./_assert'), rw = require('../lib/routewaffles');

// A straight run due east along 30N. One degree of longitude there is
// 69.17 * cos(30) = 59.9 miles, so every figure below is checkable by hand.
var poly = []; for (var i = 0; i <= 10; i++) poly.push([30, -90 + i * 0.1]);

t.close(rw.routeMiles(poly), 59.9, 0.3, 'ten tenths of a degree at 30N is 59.9 mi');
t.eq(rw.cumulativeMiles(poly).length, 11, 'one cumulative entry per vertex');
t.eq(rw.cumulativeMiles(poly)[0], 0, 'the run starts at mile zero');

var rows = [
  { city:'Near',  lat:30.001, lon:-89.55 },   // 0.07 mi off, mile 26.9
  { city:'Mid',   lat:30.02,  lon:-89.75 },   // ~1.4 mi off, mile 15
  { city:'Far',   lat:30.40,  lon:-89.50 },   // 27 mi off - not on this run
  { city:'Behind',lat:30.00,  lon:-90.60 }    // before the origin
];

var tight = rw.projectStops(poly, rows, 1);
t.eq(tight.length, 1, 'a one-mile corridor admits only the closest');
t.eq(tight[0].row.city, 'Near', 'and that is Near');
t.close(tight[0].routeMile, 26.9, 0.4, 'Near sits at mile 26.9');
t.close(tight[0].detourMi, 0.07, 0.05, 'seven hundredths of a mile off the road');

var wide = rw.projectStops(poly, rows, 3);
t.eq(wide.length, 2, 'three miles picks up Mid as well');
t.eq(wide[0].row.city, 'Mid', 'results are ordered by route mile, not by distance');
t.eq(wide[1].row.city, 'Near', 'so Near comes second despite being closer to the road');

// A point past the end of the line projects to the endpoint, not off into
// negative or overshot mileage - this is what clamping t to [0,1] buys.
var off = rw.projectStops(poly, [rows[3]], 200)[0];
t.eq(off.routeMile, 0, 'a stop behind the origin clamps to mile zero');

var ad = rw.stopsAlongRoute(poly, rows);
t.eq(ad.tierUsed, 1, 'the tight tier is tried first');
t.eq(ad.widened, false, 'and is not reported as widened when it works');
t.eq(ad.stops.length, 1, 'so the list is not padded with farther stops');

var lonely = rw.stopsAlongRoute(poly, [rows[1]]);
t.eq(lonely.tierUsed, 3, 'nothing at one mile widens to three');
t.eq(lonely.widened, true, 'and says so');

var none = rw.stopsAlongRoute(poly, [rows[2]]);
t.eq(none.stops.length, 0, 'a genuinely off-route stop is never conjured in');
t.eq(rw.projectStops([], rows, 5).length, 0, 'an empty polyline is not an error');
t.eq(rw.projectStops([[30,-90]], rows, 5).length, 0, 'nor is a single-point one');
t.done('routewaffles');
