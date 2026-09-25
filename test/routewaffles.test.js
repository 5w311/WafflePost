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

// projectStops skips segments whose bounding box cannot hold a stop within
// maxDetourMi. The pads are deliberately generous, but a future tightening
// could start dropping rows that are legitimately just inside the tolerance -
// silently, since it would only ever remove results. These pin both sides of
// the boundary. One degree of latitude is ~69 miles, so 0.0145 deg is ~1 mi.
var straight = [[35.0, -90.0], [35.0, -89.0]];          // due east along 35N
var justIn  = [{city:'In',  state:'XX', exit:'1', feet:100, lat:35.0 + 0.0130, lon:-89.5}];
var justOut = [{city:'Out', state:'XX', exit:'2', feet:100, lat:35.0 + 0.0300, lon:-89.5}];
t.eq(rw.projectStops(straight, justIn, 1).length, 1,
     'a row just inside the detour tolerance survives the bounding-box skip');
t.eq(rw.projectStops(straight, justOut, 1).length, 0,
     'a row outside it is still excluded');
// Same row, wider tolerance: the pad scales with maxDetourMi rather than
// being a constant that happens to work at tier 1.
t.eq(rw.projectStops(straight, justOut, 3).length, 1,
     'and reappears when the tolerance genuinely covers it');

// ---- dry stretches ----------------------------------------------------------
// Stops are faked at the only field dryStretches reads. The run below is the
// real 13-2026 shape of Dallas to Orlando by I-49: Terrell 31, Longview 126,
// Marshall 147, then nothing until Henderson at 412.
function at(m) { return { routeMile: m }; }
t.eq(rw.DRY_STRETCH_MI, 150, 'a dry stretch is 150 miles or more');

var run = [at(31), at(126), at(147), at(412), at(448)];
var dry = rw.dryStretches(run, 500);
t.eq(dry.length, 1, 'one dry stretch on the Dallas run');
t.eq(dry[0].miles, 265, 'Marshall to Henderson is 265 miles');
t.eq(dry[0].before, 3, 'and it sits in front of Henderson, the fourth stop');
t.eq(dry[0].fromMile, 147, 'starting at Marshall');
t.eq(dry[0].toMile, 412, 'ending at Henderson');

t.eq(rw.dryStretches([], 300).length, 1, 'a run with no stops is one dry stretch');
t.eq(rw.dryStretches([], 300)[0].before, 0, 'which sits in front of nothing, at index 0');
t.eq(rw.dryStretches([], 100).length, 0, 'unless the whole run is shorter than the threshold');

var late = rw.dryStretches([at(200)], 260);
t.eq(late.length, 1, 'a first stop 200 miles out is a stretch before it');
t.eq(late[0].before, 0, 'ahead of the first stop');

var tail = rw.dryStretches([at(40)], 400);
t.eq(tail[0].before, 1, 'a long run after the last stop sits after it, at stops.length');
t.eq(tail[0].miles, 360, 'from the last stop to the end of the route');

t.eq(rw.dryStretches([at(150)], 160).length, 1, 'exactly 150 miles counts');
t.eq(rw.dryStretches([at(149)], 160).length, 0, 'and 149 does not');
t.eq(rw.dryStretches([at(60)], 120, 50).length, 2, 'the threshold can be passed in');
t.eq(rw.dryStretches(null, 90).length, 0, 'no stops and a short run is nothing, not a crash');

t.done('routewaffles');
