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
t.eq(libTags.length, 7, 'all seven lib modules are loaded');
libTags.forEach(function(tag){
  t.eq(tag.indexOf('?v=' + ver) !== -1, true, 'cache-stamped with APP_VERSION: ' + tag);
  // defer would break the shim: the inline __mods captures between scripts
  // are NOT deferred, so each would read an empty module.exports and every
  // lib would silently become {}. No error would be thrown anywhere.
  t.eq(/\bdefer\b|\basync\b/.test(tag), false, 'no defer/async on: ' + tag);
});

// The five HERE SDK tags are third-party CDN URLs at a pinned version, not our
// files. A ?v= stamp on them would be a cache-buster on someone else's cache.
var hereTags = src.match(/<script src="https:\/\/js\.api\.here\.com\/[^"]+"><\/script>/g) || [];
t.eq(hereTags.length, 5, 'five HERE SDK scripts are loaded');
hereTags.forEach(function(tag){
  t.eq(tag.indexOf('?v=') === -1, true, 'no version stamp on third-party CDN: ' + tag);
});

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

t.eq((src.match(/^var ATLAS_REV   = /m) || []).length, 1, 'one ATLAS_REV declaration');
t.eq(src.indexOf('id="revLine"') !== -1, true, 'the atlas revision has a home in the header');

// Two tabs, and only two. Near me and Corridor were removed at v2.0.0; this
// fails if a third quietly reappears without the README being updated.
t.eq((src.match(/class="mode" role="tab"/g) || []).length, 2, 'exactly two mode tabs');
t.eq(src.indexOf('id="mAtlas"') !== -1 && src.indexOf('id="mRoute"') !== -1, true,
     'and they are Atlas and Route');

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

// The key must ship empty. A committed key is a key in the git history
// forever, and this test is the thing standing between a local paste and
// an accidental push.
var keyDecl = src.match(/^var HERE_API_KEY = '([^']*)';/m);
t.eq(!!keyDecl, true, 'HERE_API_KEY is declared');
t.eq(keyDecl[1], '', 'HERE_API_KEY ships empty - never commit a real one');

// Route mode is the only thing allowed to reach the network.
var appBlock = blocks.filter(function(b){ return b.indexOf('var DATA = [') !== -1; })[0];
var fetches = (appBlock.match(/fetch\(/g) || []).length;
t.eq(fetches, 2, 'exactly two network calls exist: geocode and routing');
t.done('structure');
