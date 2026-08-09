var t = require('./_assert'), wd = require('../lib/waffledist');

t.eq(wd.tierFor(170), 'porch', 'Good Hope is front porch');
t.eq(wd.tierFor(500), 'porch', 'tier boundary is inclusive');
t.eq(wd.tierFor(501), 'short', 'just past the porch');
t.eq(wd.tierFor(2112), 'long', 'the walkable line itself is still a long walk');
t.eq(wd.tierFor(2392), 'honorary', 'Bishopville is past the line');
t.eq(wd.tierFor(-1), null, 'negative feet is not a tier');
t.eq(wd.tierFor('170'), null, 'a string is not a tier');

t.eq(wd.isWalkable(2112), true, '0.4 mi is walkable');
t.eq(wd.isWalkable(2113), false, 'one foot past is not');

t.eq(wd.walkMinutes(170), 0.5, '170 ft rounds to half a minute');
t.eq(wd.roundTripMinutes(2392), 18, 'Bishopville round trip is 18 min');
t.eq(wd.walkMinutes(-5), null, 'no walk time for negative feet');

var mi = wd.haversine({lat:30.4780915,lon:-90.4564561},{lat:30.4775468,lon:-90.4562919});
t.close(mi * 5280, 205, 3, 'Hammond measures 205 ft, as audited');
t.eq(wd.haversine(null, {lat:1,lon:1}), null, 'missing point yields null');
t.eq(wd.formatMiles(3.14159), '3.1 mi', 'under ten miles keeps a decimal');
t.eq(wd.formatMiles(42.6), '43 mi', 'over ten miles does not');
t.eq(wd.formatMiles(null), '', 'a missing distance prints nothing, not "NaN mi"');
t.done('waffledist');
