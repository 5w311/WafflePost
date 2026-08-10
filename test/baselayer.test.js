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

t.done('baselayer');
