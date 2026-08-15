// The one conditional standing between a theme toggle and a driver's
// satellite view. Layers are compared by identity, so plain sentinels do.
var t = require('./_assert');
var bl = require('../lib/baselayer.js');

var LIGHT = {name:'vector.normal.map'};
var DARK  = {name:'vector.normal.mapnight'};
var SAT   = {name:'raster.satellite.map'};
var L = {light:LIGHT, dark:DARK};

// ---- the ordinary road-layer swaps ----
t.eq(bl.nextBaseLayer(LIGHT, 'dark', L), DARK, 'light map + dark theme -> night map');
t.eq(bl.nextBaseLayer(DARK, 'light', L), LIGHT, 'night map + light theme -> day map');

// ---- already correct: no work, and no event to feed back ----
t.eq(bl.nextBaseLayer(LIGHT, 'light', L), null, 'day map in light theme needs no change');
t.eq(bl.nextBaseLayer(DARK, 'dark', L), null, 'night map in dark theme needs no change');

// ---- THE BUG THAT TOOK FIVE RELEASES ----
// A driver on satellite imagery who switches theme, or whose phone rolls over
// to dark at dusk, must stay on satellite. This is the entire reason the
// function exists, and the reason it is an allow-list rather than a
// deny-list: a check for "is this satellite" would have to be updated every
// time HERE adds a layer, and would be wrong until someone noticed.
t.eq(bl.nextBaseLayer(SAT, 'dark', L), null, 'satellite is never yanked away by a dark theme');
t.eq(bl.nextBaseLayer(SAT, 'light', L), null, 'nor by a light one');

// An unknown layer - a future HERE default, a layer some later feature adds -
// is treated exactly like satellite: not ours, not touched.
t.eq(bl.nextBaseLayer({name:'something.new'}, 'dark', L), null,
     'an unrecognised layer is left alone rather than replaced');
t.eq(bl.nextBaseLayer(null, 'dark', L), null, 'a null current layer asks for nothing');
t.eq(bl.nextBaseLayer(undefined, 'light', L), null, 'and so does undefined');

// ---- theme argument is a RESOLVED theme, never a choice ----
// 'system' must never reach this function: it is not a theme, and anything
// that is not exactly 'dark' resolves to the light layer. Pinned so that a
// caller passing the raw radio-button choice fails a test rather than
// silently forcing every 'system' user onto the day map.
t.eq(bl.nextBaseLayer(DARK, 'system', L), LIGHT,
     'any non-dark string means the light layer - callers must resolve first');
t.eq(bl.nextBaseLayer(LIGHT, 'system', L), null,
     'which is why "system" looks like "light" here, and why callers resolve');

// ---- identity, not shape ----
// Two layers that merely look alike are different layers. HERE hands back
// distinct provider instances for map and mapnight, and the control matches
// on identity too, so anything softer than === would be wrong.
t.eq(bl.nextBaseLayer({name:'vector.normal.map'}, 'dark', L), null,
     'a look-alike object is not the light layer and is left alone');

// ---- more than one themed pair (v4.1.0: the satellite view is themed too) ----
// The satellite view became HERE's hybrid stack, which has day and night
// variants, so there are now two pairs to keep in step rather than one. The
// allow-list property has to survive that: belonging to no pair still means
// hands off.
var HDAY = {name:'hybrid.day.raster'}, HNIGHT = {name:'hybrid.night.raster'};
var P = {pairs:[L, {light:HDAY, dark:HNIGHT}]};

t.eq(bl.nextBaseLayer(LIGHT, 'dark', P), DARK, 'the road pair still swaps with two pairs present');
t.eq(bl.nextBaseLayer(HDAY, 'dark', P), HNIGHT, 'day satellite + dark theme -> night satellite');
t.eq(bl.nextBaseLayer(HNIGHT, 'light', P), HDAY, 'and back again');
t.eq(bl.nextBaseLayer(HDAY, 'light', P), null, 'day satellite in a light theme needs no change');
t.eq(bl.nextBaseLayer(HNIGHT, 'dark', P), null, 'nor night satellite in a dark one');
// The whole point of the allow-list, restated for the multi-pair form: a layer
// in NO pair is still the driver's choice or HERE's, and still untouched. If
// this ever fails, the five-release bug is back in a new shape.
t.eq(bl.nextBaseLayer(SAT, 'dark', P), null,
     'a layer belonging to no pair is left alone exactly as before');
t.eq(bl.nextBaseLayer({name:'something.new'}, 'light', P), null, 'and so is an unknown one');
t.eq(bl.nextBaseLayer(null, 'dark', P), null, 'and null asks for nothing');
// A pair that is not built yet - a keyless build, a layer HERE did not return -
// must not throw on the way past.
t.eq(bl.nextBaseLayer(LIGHT, 'dark', {pairs:[null, L]}), DARK,
     'a missing pair is skipped rather than thrown on');

t.done('baselayer');
