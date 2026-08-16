// Pins the things about index.html that are easy to break silently:
// cache-busting stamps, script loading flags, and whether the inline app
// script even parses. Mirrors the reason FuelPost has cachebust.test.js -
// a deploy that pairs new HTML with a cached old lib is a build that exists
// in no commit.
var t = require('./_assert'), fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var ver = (src.match(/^var APP_VERSION = '([\d.]+)';/m) || [])[1];
t.eq(!!ver, true, 'APP_VERSION is declared at the start of a line');

var libTags = src.match(/<script src="lib\/[^"]+"><\/script>/g) || [];
t.eq(libTags.length, 11, 'all eleven lib modules are loaded');
libTags.forEach(function(tag){
  t.eq(tag.indexOf('?v=' + ver) !== -1, true, 'cache-stamped with APP_VERSION: ' + tag);
  // defer would break the shim: the inline __mods captures between scripts
  // are NOT deferred, so each would read an empty module.exports and every
  // lib would silently become {}. No error would be thrown anywhere.
  t.eq(/\bdefer\b|\basync\b/.test(tag), false, 'no defer/async on: ' + tag);
});

// The HERE SDK tags are third-party CDN URLs at a pinned version, not our
// files. A ?v= stamp on them would be a cache-buster on someone else's cache.
// FOUR since v4.2.0: 3.1 needed a separate mapsjs-harp.js for the render
// engine, and 3.2 folds it into core. /v3/3.2/mapsjs-harp.js does not exist,
// so re-adding the fifth tag out of habit is a 403 and a dead map.
var hereTags = src.match(/<script src="https:\/\/js\.api\.here\.com\/[^"]+"><\/script>/g) || [];
t.eq(hereTags.length, 4, 'four HERE SDK scripts are loaded');
t.eq(hereTags.some(function(tag){ return /mapsjs-harp/.test(tag); }), false,
     'no mapsjs-harp.js: 3.2 ships the render engine inside core');
hereTags.forEach(function(tag){
  t.eq(tag.indexOf('?v=') === -1, true, 'no version stamp on third-party CDN: ' + tag);
});

// One SDK version across every HERE URL, script tags and stylesheet alike.
// A stylesheet left on the old version is the kind of mismatch that shows up
// as one control laid out wrongly rather than as an error.
var hereUrls = src.match(/https:\/\/js\.api\.here\.com\/v3\/[\d.]+\//g) || [];
t.eq(hereUrls.length >= 5, true, 'the HERE CDN is referenced by scripts and the stylesheet');
t.eq(hereUrls.filter(function(u){ return u !== hereUrls[0]; }).length, 0,
     'every HERE URL pins the same SDK version: ' + hereUrls[0]);

// H.service.Platform THROWS on an empty apikey ("Argument #0 apikey must be
// specified"), and the key ships empty by design two assertions below. An
// unguarded construction therefore aborts the whole inline script and takes
// the atlas down with the map - no rows, no filters, not even Route's own
// "needs a key" explainer. Nothing else in this suite would catch it: these
// tests never run a browser, and the app script still PARSES perfectly.
t.eq(/var MAP_ON = !!HERE_API_KEY;/.test(src), true,
     'the map bring-up is gated on a non-empty key (MAP_ON)');
var guardAt = src.indexOf('if (MAP_ON) {'), platAt = src.indexOf('new H.service.Platform');
t.eq(guardAt !== -1 && platAt > guardAt, true,
     'H.service.Platform is constructed only inside that gate');

// Leaflet and CARTO left at 3.0.0. Prose in comments may still name them
// (explaining why the anchoring is what it is); URLs and L. calls may not.
t.eq(/cdnjs\.cloudflare\.com|basemaps\.cartocdn\.com/.test(src), false,
     'no Leaflet or CARTO CDN URLs remain');
t.eq(/\bL\.(map|marker|divIcon|polyline|tileLayer|featureGroup|layerGroup|control)\b/.test(src),
     false, 'no Leaflet API calls remain');

// Home screen and tab icons. A missing file here fails silently in the worst
// way: the browser asks for it, gets a 404, and quietly shows a generic icon
// or a screenshot of the page. Nothing in the app breaks, so nobody notices
// until someone adds it to a home screen. So assert both halves - the link is
// declared AND the file it points at is really there.
// The apple-touch-icon MUST carry an explicit sizes. WebKit ignores `media`
// on touch icons and falls back to declared size when choosing between
// candidates, defaulting to 60px for a link that omits it - so an unsized
// link here is what would let any second touch icon outrank the real one.
// See the head comment; this is the assertion that keeps that reasoning true.
[['apple-touch-icon', /<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)">/],
 ['favicon 32',       /<link rel="icon" type="image\/png" sizes="32x32" href="([^"]+)">/],
 ['favicon 16',       /<link rel="icon" type="image\/png" sizes="16x16" href="([^"]+)">/],
 ['manifest',         /<link rel="manifest" href="([^"]+)">/]
].forEach(function(pair){
  var m = src.match(pair[1]);
  t.eq(!!m, true, pair[0] + ' is declared in the head');
  if (m) t.eq(fs.existsSync(path.join(__dirname, '..', m[1])), true,
              pair[0] + ' file exists: ' + m[1]);
});

// The manifest fails the same quiet way, one level deeper: a bad icon path
// inside it costs Android the home screen icon and says nothing. Parse it and
// follow every src.
var mfRef = (src.match(/<link rel="manifest" href="([^"]+)">/) || [])[1];
if (mfRef) {
  var mfPath = path.join(__dirname, '..', mfRef);
  var mf = null;
  try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (e) {
    console.log('  manifest parse error: ' + e.message);
  }
  t.eq(!!mf, true, 'the manifest is valid JSON');
  if (mf) {
    // short_name is what Android prints under the icon; without it the label
    // falls back to <title>, which is the thing the manifest was added to fix.
    t.eq(typeof mf.short_name === 'string' && mf.short_name.length > 0, true,
         'the manifest names the app for the home screen');
    t.eq(Array.isArray(mf.icons) && mf.icons.length > 0, true, 'the manifest lists icons');
    (mf.icons || []).forEach(function (ic) {
      t.eq(fs.existsSync(path.join(__dirname, '..', ic.src)), true,
           'manifest icon exists: ' + ic.src);
    });
    // Android wants 192 and 512; a maskable variant keeps a circular launcher
    // mask from clipping the glyph.
    var sizes = (mf.icons || []).map(function (i) { return i.sizes; });
    t.eq(sizes.indexOf('192x192') !== -1, true, 'a 192x192 icon is declared');
    t.eq(sizes.indexOf('512x512') !== -1, true, 'a 512x512 icon is declared');
    t.eq((mf.icons || []).some(function (i) { return i.purpose === 'maskable'; }), true,
         'a maskable icon is declared');
  }
}

t.eq((src.match(/^var ATLAS_REV   = /m) || []).length, 1, 'one ATLAS_REV declaration');
// v4.3.0 moved the rev out of the header (there is no header) into the panel
// tab's summary slot. The requirement it satisfies is unchanged and is written
// out in the head comment: a driver cannot tell stale atlas data from current
// atlas data without it, so it must be permanently on screen. Assert it is
// still WRITTEN somewhere, not merely that a constant exists - a rev nothing
// renders is the failure this guards.
t.eq(/\$\('panelSummary'\)\.textContent\s*=\s*ATLAS_REV/.test(src), true,
     'the atlas revision has a home in the panel tab');

// Two tabs, and only two. Near me and Corridor were removed at v2.0.0; this
// fails if a third quietly reappears without the README being updated.
// The class changed with v4.3.0's segmented control; the roles did not.
t.eq((src.match(/class="modetab" role="tab"/g) || []).length, 2, 'exactly two mode tabs');
t.eq(src.indexOf('id="mAtlas"') !== -1 && src.indexOf('id="mRoute"') !== -1, true,
     'and they are Atlas and Route');
// A tablist, not a toggle group. The vehicle profile control uses aria-pressed
// because it IS a group of toggles; this picks one of two views. Someone
// "making them consistent" is the way this regresses.
t.eq(/role="tablist"[\s\S]{0,240}id="mAtlas"/.test(src), true, 'the mode tabs live in a tablist');
t.eq(/id="mAtlas" aria-selected/.test(src) && /id="mRoute" aria-selected/.test(src), true,
     'and are driven by aria-selected, not aria-pressed');

// ---- the bar can never be hidden (v4.3.0) ----
// The mode control lives in the bar now. Hiding the bar in Route mode - which
// is exactly what setMode used to do to the toolbar it replaced - would strand
// a driver in Route with no way back to Atlas. This is the one way this change
// can go badly wrong, so it is pinned three ways: not in the markup, not in
// setMode, not anywhere in the app script.
t.eq(/<div class="bar" id="bar">/.test(src), true, 'the bar exists and carries no hidden class');
var setModeSrc = (src.match(/function setMode\(m\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(setModeSrc.length > 0, true, 'found setMode');
t.eq(/\$\('bar'\)/.test(setModeSrc), false, 'setMode never touches the bar element');
t.eq(/\$\('bar'\)[\s\S]{0,80}hidden/.test(src), false,
     'nothing anywhere adds hidden to the bar');
// And the pieces that DO swap are still swapping, so the assertion above is
// not passing merely because setMode stopped doing anything.
t.eq(/\$\('searchWrap'\)\.classList\.toggle\('hidden'/.test(setModeSrc), true,
     'search is Atlas-only');
t.eq(/\$\('filterSection'\)\.classList\.toggle\('hidden'/.test(setModeSrc), true,
     'the filter half of the popover is Atlas-only');
// One button, both modes: the legend is reachable in Route, where pins and
// walk strips are still on screen and still need explaining.
t.eq((src.match(/id="chromeBtn"/g) || []).length, 1, 'exactly one chrome button');
t.eq(/\$\('fDot'\)\.classList\.toggle\('hidden', n2===0 \|\| state\.mode!=='atlas'\)/.test(src), true,
     'the filter badge shows in Atlas only');

// ---- the atlas list shows three rows, then scrolls (v4.4.0) ----
// The panel ran to max-height:62% and took half the screen from the thing the
// app is for. The cap is MEASURED from the first three real rows rather than
// hardcoded, because a row carrying a pill is taller than one that is not and
// a px constant would cut the third row in half on some phones.
t.eq(/var PANEL_ROWS = 3;/.test(src), true, 'the atlas list is capped at three rows');
t.eq(/rows\[i\]\.offsetHeight/.test(src), true,
     'the cap is measured from real rows, not a hardcoded pixel height');
// Called from BOTH places it has to be: after every render, and again when the
// panel is reopened - the body is display:none while collapsed, so every
// height inside it reads 0 and a cap computed then would stick it shut.
var renderSrc = (src.match(/function render\(\)\{[\s\S]*?\n\}/) || [''])[0];
var toggleSrc = (src.match(/function togglePanel\(\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/capPanelRows\(\)/.test(renderSrc), true, 'render re-caps the list');
t.eq(/capPanelRows\(\)/.test(toggleSrc), true, 'reopening the panel re-caps it');
t.eq(/state\.mode !== 'atlas'[\s\S]{0,120}return;/.test(src), true,
     'Route mode keeps its own panel: the cap is Atlas only');

// max(), not calc(). calc(10px + inset) stacks a gap on top of an inset that
// exists to BE that gap - 69px of top padding on a Dynamic Island phone.
t.eq(/padding-top:calc\([\d.]+px \+ env\(safe-area-inset-top/.test(src), false,
     'the bar does not stack padding on top of the safe area inset');
t.eq(/padding-top:max\([\d.]+px, env\(safe-area-inset-top,0px\)\)/.test(src), true,
     'it takes the larger of the two');

// The range inputs are gone on purpose. A reappearing "hours" or "mph" field
// means the break planner crept back in.
t.eq(/id="rHours"|id="rMph"/.test(src), false, 'no range or hours inputs');

// Vehicle profile must actually reach the routing request - the whole point
// of keeping it. transportMode=truck alone applies no dimensions at all.
t.eq(src.indexOf('vp.toHereParams(state.vehicle)') !== -1, true,
     'the vehicle profile is passed to the routing call');
t.eq(src.indexOf('id="verLine"') !== -1, true, 'the app version has a home in the legend');

// The inline application script must at least parse. new Function compiles
// without executing, so document/L being absent under node does not matter.
var blocks = src.split('<script>').slice(1).map(function(s){ return s.split('</script>')[0]; });
var app = blocks.filter(function(b){ return b.indexOf('var DATA = [') !== -1; })[0];
t.eq(!!app, true, 'found the application script block');
var parsed = true;
try { new Function(app); } catch (e) { parsed = false; console.log('  parse error: ' + e.message); }
t.eq(parsed, true, 'the application script parses');

t.eq(/localStorage/.test(src) && /catch\s*\(e\)/.test(src), true,
     'localStorage access is wrapped - it throws in sandboxed frames');

// The key ships PRESENT, and this test guards the opposite failure to the one
// it used to. Until 3.0.0 the key was Route's alone, so shipping blank cost
// one optional tab and the test stood between a local paste and an accidental
// push. Now the map authenticates with it at load, GitHub Pages serves this
// repo verbatim, and there is no build step to inject one - so a blank key
// means the published site can never draw a map. A client-side map app cannot
// hide a key in any case; domain restriction in HERE's console is what makes
// publishing one survivable, not secrecy. See the README.
var keyDecl = src.match(/^var HERE_API_KEY = '([^']*)';/m);
t.eq(!!keyDecl, true, 'HERE_API_KEY is declared');
t.eq(keyDecl[1].length > 20, true,
     'a real HERE key ships - the map needs it at load, and Pages has no build step');

// Route mode is still the only thing allowed to reach the network, and the
// count is pinned so a new call site is a deliberate act rather than a
// surprise on someone's data plan. Note this counts CALL SITES, not calls per
// plan - six sites, all in the Route drawer:
//   geocode, routing            - once per plan
//   routing retry               - a SITE, not a call: only reached when the
//                                 first routing request already 400'd, so it
//                                 adds nothing on the happy path
//   autosuggest                 - per keystroke, debounced 300ms / 3-char min
//   lookup                      - only for a suggestion carrying no position
//   revgeocode                  - only on tapping "use my current location"
// The Atlas tab still calls nothing; every row, distance and filter is
// computed from DATA. Raising this number is a call-volume decision on a
// public key - see lib/autosuggest.js for why the debounce values are what
// they are.
var appBlock = blocks.filter(function(b){ return b.indexOf('var DATA = [') !== -1; })[0];
var fetches = (appBlock.match(/fetch\(/g) || []).length;
t.eq(fetches, 6, 'exactly six network call sites exist, all in Route');

// alternatives > 6 is HTTP 400 (E605015), and so is a non-numeric value -
// either takes ROUTING down entirely, not just the extras. The count must be
// a literal in the source, never derived from config, state or user input.
t.eq(/var ALTERNATIVES = [1-6];/.test(src), true,
     'the alternatives count is a hardcoded literal inside HERE\'s legal range');

// The map's base layer moves through ONE choke point, which is deferred,
// coalesced and idempotent because the HARP engine rebuilds its whole theme
// asynchronously on every swap. A second call site would be able to land a
// swap inside that window - the failure the sibling app hit twice on real
// phones. HERE's own layer switcher is the only other thing allowed to move
// it, and that is the driver's choice, not ours.
t.eq((appBlock.match(/\.setBaseLayer\(/g) || []).length, 1,
     'exactly one setBaseLayer call site: the deferred choke point');
// And the theme must ask before it swaps. Calling setNormalBaseLayer without
// consulting nextBaseLayer is the single missing conditional that took the
// sibling app five releases - it yanks a driver off Satellite on a theme
// change. lib/baselayer.js holds the decision; this pins that it is consulted.
t.eq(/bl\.nextBaseLayer\(/.test(appBlock), true,
     'the theme consults nextBaseLayer before touching the base layer');

// ---- the satellite view shows GROUND (v4.1.0) ----
// Comments stripped first: this file's rules are about what the app DOES, and
// the map setup explains at length what it deliberately stopped doing. Scanning
// prose for the name of the layer that was removed fails on the explanation of
// why it was removed, which would push the next person into deleting the
// reasoning to get their build green.
var appCode = appBlock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// raster.satellite.map is the `base` resource on explore.satellite.day: HERE
// bakes road casings and labels into the JPEG, repainting 35% of the ground at
// z17 and 46% at z19. This app's one claim is that a walk is walkable, so the
// baked layer must not come back by reflex.
t.eq(/raster\.satellite\.map/.test(appCode), false,
     'the baked-label satellite raster is not used as a base layer');
t.eq(/defaultLayers\.hybrid\.day\.raster/.test(appCode) &&
     /defaultLayers\.hybrid\.night\.raster/.test(appCode), true,
     'Satellite is the hybrid stack, day and night');
t.eq(/defaultLayers\.hybrid\.day\.vector/.test(appCode) &&
     /defaultLayers\.hybrid\.night\.vector/.test(appCode), true,
     'and both vector overlays are wired to their rasters');
// INDEX 1, not appended. The marker layer is already on the map before anyone
// taps Satellite, so an appended overlay draws over every pin and the route
// line. This is the one number that keeps the atlas visible on satellite.
t.eq(/map\.addLayer\([^)]*,\s*1\)/.test(appCode), true,
     'the vector overlay is inserted at index 1, above the base and below the objects');
// One place syncs it, so no route to the base layer can leave labels stranded
// over the road map.
t.eq((appCode.match(/map\.addLayer\(/g) || []).length, 1,
     'exactly one addLayer call site: the overlay sync');
t.eq((appCode.match(/baselayerchange/g) || []).length, 1,
     'and one baselayerchange handler owning it');

t.done('structure');
