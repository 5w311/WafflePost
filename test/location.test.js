// Pure GPS-fix helpers, vendored unmodified from FuelPost. Only the pickup
// field's "use my current location" button reads these here - WafflePost has
// no live position dot - but the module ships whole rather than trimmed, so
// there is one copy between the two apps and not two that can drift.
var t = require('./_assert');
var loc = require('../lib/location.js');

// The fallback label is what the pickup field shows when a fix lands but
// reverse geocoding fails or is unreachable. It has to be a usable address
// line on its own, because it is what the driver sees in the box.
t.eq(loc.formatGpsFallbackLabel(35.04561, -89.97734),
     'Current location (35.0456, -89.9773)',
     'fallback label rounds to 4 decimals');
t.eq(loc.formatGpsFallbackLabel(0, 0), 'Current location (0.0000, 0.0000)',
     'zero coordinates still format as a full label');
t.eq(loc.formatGpsFallbackLabel(-33.8688, 151.2093),
     'Current location (-33.8688, 151.2093)',
     'negative latitude keeps its sign');
// 4 decimals is ~11 m: enough to identify a dock door, short enough that
// successive fixes at one stop produce the same string.
t.eq(loc.formatGpsFallbackLabel(35.045612345, -89.977339999),
     'Current location (35.0456, -89.9773)',
     'extra precision is truncated, not carried');

// isPreciseFix is unused by WafflePost today (it gates FuelPost's map dot).
// Tested anyway: it ships in the file, and an untested export in lib/ is the
// thing this repo does not do.
t.eq(loc.isPreciseFix(50), true, 'a 50 m fix is precise');
t.eq(loc.isPreciseFix(300), true, 'the 300 m default threshold is inclusive');
t.eq(loc.isPreciseFix(301), false, 'just past the threshold is not precise');
t.eq(loc.isPreciseFix(1200, 2000), true, 'an explicit threshold is honoured');
// A missing accuracy must read as "not precise" rather than throwing or
// passing - browsers do return fixes without a usable accuracy.
t.eq(loc.isPreciseFix(null), false, 'a null accuracy is not precise');
t.eq(loc.isPreciseFix(undefined), false, 'a missing accuracy is not precise');
t.eq(loc.isPreciseFix('50'), false, 'a string accuracy is not precise');

t.done('location');
