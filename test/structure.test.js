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
 ['favicon 16',       /<link rel="icon" type="image\/png" sizes="16x16" href="([^"]+)">/]
].forEach(function(pair){
  var m = src.match(pair[1]);
  t.eq(!!m, true, pair[0] + ' is declared in the head');
  if (m) t.eq(fs.existsSync(path.join(__dirname, '..', m[1])), true,
              pair[0] + ' file exists: ' + m[1]);
});

// ---- the manifest link is back (v4.6.1) ----
// v4.6.0 inverted this assertion to hold a dark-icon experiment in place:
// remove the link, see whether the home screen icon stops being darkened by
// iOS Dark appearance. Observed on device after a delete-and-re-add: STILL
// DARK. The link was not the lever, so it was costing Android installability
// for nothing and it is back. That inverted assertion said it was the one to
// flip back, deliberately, with the head comment updated in the same change -
// this is that change. The experiment is written up in the icon comment in
// index.html; do not re-run it without reading that first.
t.eq(/<link rel="manifest" href="([^"]+)">/.test(src), true, 'the manifest is linked again');
// The stand-ins went with the revert. display:standalone is the supported way
// to ask for standalone and had been doing it for releases; keeping both would
// be an untested combination adopted right after a failed experiment.
// Matched as a TAG, not as a string: the icon comment names these metas while
// writing up what v4.6.0 did, and a bare substring test fails on the account
// of the experiment rather than on the markup it describes.
t.eq(/<meta name="apple-mobile-web-app-capable"/.test(src), false,
     'the legacy standalone metas went back out with it');
t.eq(/<meta name="apple-mobile-web-app-status-bar-style"/.test(src), false,
     'both of them');

// The manifest is read by its own path rather than through the captured href,
// which is how v4.6.0 left it and is the more useful shape: the file has to be
// valid whether or not anything links it, since it is the revert path in both
// directions. It fails the same quiet way it always did - a bad icon path
// inside it costs Android the home screen icon and says nothing.
var mfPath = path.join(__dirname, '..', 'manifest.json');
t.eq(fs.existsSync(mfPath), true, 'manifest.json is in the repo');
t.eq(fs.existsSync(path.join(__dirname, '..',
     (src.match(/<link rel="manifest" href="([^"]+)">/) || [])[1] || 'nope')), true,
     'and the link points at a file that exists');
var mf = null;
try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (e) {
  console.log('  manifest parse error: ' + e.message);
}
t.eq(!!mf, true, 'the manifest is valid JSON');
if (mf) {
  // short_name is what Android would print under the icon if the manifest were
  // linked. Unlinked, the label falls back to <title> - asserted below.
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

// ---- every shipped icon is flat RGB (v4.6.3) ----
// iOS composites transparency onto black, so an alpha channel buys nothing and
// risks a black wedge showing through the superellipse mask. A regeneration
// that forgets the flatten looks perfect on a desktop and is wrong on a phone,
// which is exactly the class of change no other assertion here would catch.
// Read from the PNG header rather than by decoding: bytes 24 (bit depth) and
// 25 (colour type) of the IHDR, which is always the first chunk. Colour type 2
// is truecolour RGB; 6 is RGBA and 4 is grey+alpha, both of which fail.
['apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
 'icon-maskable-512.png', 'favicon-32.png', 'favicon-16.png'].forEach(function (name) {
  var p = path.join(__dirname, '..', name);
  t.eq(fs.existsSync(p), true, name + ' is in the repo');
  if (!fs.existsSync(p)) return;
  var buf = fs.readFileSync(p);
  t.eq(buf.slice(1, 4).toString('ascii'), 'PNG', name + ' is a PNG');
  t.eq(buf.readUInt8(25), 2, name + ' is flat RGB with no alpha channel');
});

// The maskable and plain 512 are the same file since v4.6.3: the W sits inside
// the circular safe zone unshrunk, so there is nothing for the maskable one to
// do differently. Both still ship because the manifest names them separately
// and a launcher may fetch either. If a future mark needs a real shrink this
// assertion is the one to change, deliberately, with the head comment.
t.eq(fs.readFileSync(path.join(__dirname, '..', 'icon-512.png'))
       .equals(fs.readFileSync(path.join(__dirname, '..', 'icon-maskable-512.png'))), true,
     'the maskable and plain 512 are byte-identical');

// With the manifest unlinked, THIS is Android's home screen label. It is the
// difference between the experiment costing installability only and it costing
// the app's name as well.
t.eq(/<title>WafflePost<\/title>/.test(src), true,
     'the title is exactly WafflePost: it is the home screen label now');

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

// ---- the stop sheet stands where the panel does (v4.5.0) ----
// It ran to 78% of the stage, and because it is bottom-anchored at z-900 it
// covered HERE's layers button - the only way to reach Satellite.
t.eq(/max-height:78%/.test(src), false, 'the sheet no longer runs to 78% of the stage');
t.eq(/max-height:var\(--sheet-max, 78%\)/.test(src), true,
     'it is capped to the panel height, with 78% only as a pre-measurement fallback');
// --sheet-max is written in exactly one place, and that place is the CAPPED
// path of capPanelRows. Two things fall out of that and both matter:
//   - collapsed, capPanelRows returns before reaching it, so the cap is never
//     taken from the 42px tab (v4.5.0's requirement, now by structure rather
//     than by its own conditional);
//   - filtered, the cap is not reached either, so narrowing a search cannot
//     shrink the stop sheet (v4.10.0 - it used to, and a one-result search
//     came up with a card half the height it had a keystroke earlier).
var capSrc = (src.match(/function capPanelRows\(\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq((src.match(/--sheet-max'/g) || []).length, 1, '--sheet-max is written in one place');
t.eq(/--sheet-max/.test(capSrc), true, 'and that place is capPanelRows');
t.eq(/classList\.contains\('collapsed'\)[\s\S]{0,80}return;/.test(capSrc), true,
     'which returns before writing it when the panel is collapsed');
t.eq(/rows\.length <= PANEL_ROWS\) return;[\s\S]*--sheet-max/.test(capSrc), true,
     'and when the list is shorter than the cap, so a filter cannot shrink the sheet');
// HERE's controls clear whichever bottom sheet is taller. Folding this into
// --panel-h would have made the map jump when a sheet opened, because that
// number is also the map's bottom padding.
t.eq(/--chrome-h/.test(src), true, 'the control lift has its own variable');
t.eq(/\.H_l_bottom\{bottom:calc\(var\(--chrome-h/.test(src), true,
     'and the bottom controls use it');
t.eq(/setPadding\(MAP_FIT_MARGIN, MAP_FIT_MARGIN,\s*h \+ MAP_FIT_MARGIN/.test(src), true,
     'the map padding still comes from the panel alone: a sheet must not move the map');
// Flex column, not position:sticky. Sticky let content that follows the bar in
// flow render straight through underneath it.
t.eq(/\.sheet-actions\{[^}]*position:sticky/.test(src), false,
     'the action row is not sticky');
t.eq(/class="sheet-scroll"/.test(src), true, 'the sheet has one scrolling child');
t.eq(/\.sheet\.show\{display:flex\}/.test(src), true, 'and the sheet itself is a flex column');

// ---- the bar follows the theme (v4.7.0) ----
// It was --char in both themes from v1.x, with every child written against
// that dark surround in hardcoded literals. A dark bar over a cream app read
// as a fragment of a different design. It is --surface now, the same material
// as the panel at the other end of the map.
t.eq(/\.bar\{background:var\(--surface\)/.test(src), true, 'the bar is --surface');
// The literals that assumed a permanently dark bar are gone from the RULES.
// Matched as declarations, not as bare strings: the bar comment names the old
// values while explaining what they were, and a substring test would fail on
// the explanation rather than on a regression.
[['#241F1A', /background:#241F1A/], ['#4A443B', /border:1px solid #4A443B/],
 ['#C9C1B4', /color:#C9C1B4/],      ['#8E857A', /color:#8E857A/],
 ['#3A342C', /solid #3A342C/]].forEach(function (pair) {
  t.eq(pair[1].test(src), false, 'no dark-surround literal left in a rule: ' + pair[0]);
});
// The one deliberate exception, kept because it earns its place in dark mode
// only: --surface #1E1A16 against the tile's #14110E is about four levels of
// luminance, which is no edge at all.
t.eq(/\.tile\{[\s\S]{0,200}border:1px solid #332C24/.test(src), true,
     "the tile keeps its hairline, which is the bar block's one literal");
// theme-color was a static #14110E while the bar was permanently char. A fixed
// value now paints dark browser chrome above a cream bar in light mode, which
// is the exact seam this change removed.
t.eq(/function syncThemeColor\(\)/.test(src), true, 'the browser chrome colour is synced');
var applySrc = (src.match(/function applyTheme\(choice\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/syncThemeColor\(\)/.test(applySrc), true, 'every theme change updates it');
t.eq((src.match(/syncThemeColor\(\);/g) || []).length >= 2, true,
     'and boot does too, since the meta ships the light value');
// Read off the bar rather than from a table of colours, so a palette change
// moves both without anyone remembering this function exists.
t.eq(/getComputedStyle\(bar\)\.backgroundColor/.test(src), true,
     'the synced value is read from the bar itself');

// ---- the Atlas locator (v4.12.0) ----
// Continuous tracking behind one button. The failure modes worth pinning are
// all about a watch that outlives its welcome or starts without being asked.
t.eq(/id="locateBtn"/.test(src), true, 'the locator button exists');
// It rides --chrome-h like the HERE controls, so one variable lifts it clear
// of the panel, of an open sheet, and back down on collapse. A second set of
// offsets is how those two drift apart.
t.eq(/#locateBtn\{[^}]*bottom:calc\(var\(--chrome-h/.test(src), true,
     'and rides --chrome-h rather than carrying its own offsets');
// Boot must NOT reach for the GPS. A permission prompt nobody asked for is
// the one that gets denied once and then permanently.
var bootBlock = src.slice(src.indexOf('/* boot'));
t.eq(/startWatch\(\)/.test(bootBlock), false, 'boot does not start a watch');
t.eq(/locationOff = storedLocateOff\(\);/.test(src), true, 'but it does restore the persisted choice');
// startWatch is the single choke point, and it refuses while switched off -
// otherwise the visibility resume would quietly restart tracking the driver
// turned off.
var watchSrc = (src.match(/function startWatch\(\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/if \(locationOff\) return;/.test(watchSrc), true,
     'startWatch refuses while location is switched off');
t.eq((src.match(/navigator\.geolocation\.watchPosition\(/g) || []).length, 1,
     'exactly one watchPosition call site');
// Off means off: no watch, no dot, no cached fix for anything else to read.
var offSrc = (src.match(/function setLocationOff\(off\)\{[\s\S]*?\n\}/) || [''])[0];
['clearWatch\\(\\)', 'liveFix = null', 'locateGroup.removeAll\\(\\)'].forEach(function (bit) {
  t.eq(new RegExp(bit).test(offSrc), true, 'switching off clears: ' + bit.replace(/\\/g, ''));
});
// The tab-hidden pause, so a locked screen is not draining the radio.
t.eq(/visibilitychange/.test(src) && /watchPaused/.test(src), true,
     'the watch pauses while the tab is hidden');
// An exact-looking dot inside a two-kilometre accuracy circle is the map
// stating something it does not know.
t.eq(/gps\.isPreciseFix\(liveFix\.accuracy\)/.test(src), true,
     'the dot is drawn only on a precise fix');
// Two chips, not one: the watch hides the error on every fix, so a hint
// sharing that element would be wiped exactly when it is being read.
t.eq(/id="locateErr"/.test(src) && /id="locateHint"/.test(src), true,
     'error and hint are separate elements');
// Atlas only - Route has its own one-shot on the pickup field.
var setModeSrc2 = (src.match(/function setMode\(m\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/locateBtn/.test(setModeSrc2), true, 'the button is Atlas-only');
t.eq(/clearWatch\(\)/.test(setModeSrc2), false,
     'but a mode change does NOT stop tracking: both tabs share one map');

// ---- the proximity sort (v4.13.0) ----
// Tapping the locator re-orders the Atlas by how far the driver is from each
// exit. The list is the app's whole claim to authority, so what is pinned
// here is that it can never be showing an order it cannot justify.
t.eq(/\n  nearest:false,/.test(src), true,
     'state.nearest starts false: the walk leaderboard is the default order');
// ONE guard, and it is the fix, not the flag. state.nearest can be set before
// any position exists - the tap that asks for the order usually precedes the
// fix that builds it - so the sort has to be gated on having something to
// measure from, or every row sorts on NaN into its input order and the list
// silently lies while looking sorted.
t.eq(/var here = state\.nearest \? fixPoint\(\) : null;/.test(src), true,
     'the sort is gated on an actual fix, not merely on the flag');
// HERE says lng, the atlas says lon, and wd.haversine reads whatever it is
// handed. One adapter, so the mismatch cannot be reintroduced per call site.
t.eq(/function fixPoint\(\)\{ return liveFix \? \{lat:liveFix\.lat, lon:liveFix\.lng\} : null; \}/.test(src), true,
     'fixPoint is the single lng->lon adapter');
t.eq(/haversine\(\s*\{[^}]*lng:/.test(src), false,
     'nothing hands haversine an lng-keyed point, which would silently be NaN');
// Distance is measured once per row and carried alongside. A comparator that
// calls haversine does it O(n log n) times for an answer that cannot change
// mid-sort.
var atlasSort = (src.match(/var here = state\.nearest[\s\S]*?rows\.sort\(function\(a,b\)\{ return a\.feet-b\.feet; \}\);/) || [''])[0];
t.eq(/dec\.sort\(function\(a,b\)\{ return a\.d-b\.d; \}\)/.test(atlasSort), true,
     'the proximity sort compares precomputed distances');
t.eq(/sort\(function\(a,b\)\{[^}]*haversine/.test(src), false,
     'no comparator recomputes haversine per comparison');
// Switching location off takes the order with it. Leaving the list standing
// in proximity order with "N mi away" measured from a fix that was
// deliberately discarded is the app stating something it no longer knows.
var offSrc2 = (src.match(/function setLocationOff\(off\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/setNearest\(false\);/.test(offSrc2), true,
     'switching location off restores the walk leaderboard');
// ---- one order per location state (v4.14.0) ----
// The tap does not toggle the order. v4.13.0 flipped it, which made the same
// gesture recentre-and-sort one time and un-sort the next, keyed on a state
// the button does not show. Location on means nearest first; location off
// means the walk leaderboard, and switching off is the only way back.
var clickSrc = (src.match(/\$\('locateBtn'\)\.addEventListener\('click'[\s\S]*?\n\}\);/) || [''])[0];
t.eq(/setNearest\(true\);/.test(clickSrc), true, 'the tap imposes the order');
t.eq(/setNearest\(!state\.nearest\)/.test(src), false, 'and never flips it');
// Whose chip says what: the walk order is named ONLY where it can be reached
// from, which is switching location off.
// Scoped to the WHOLE set of chip strings, not to the click handler: the
// wording lives in a constant, so a handler-scoped check passes while the
// constant still says "tap again for shortest walk". That gap was found by
// mutating the constant and watching this suite stay green.
var hintLits = (src.match(/showLocateHint\('((?:[^'\\]|\\.)*)'\)/g) || [])
  .map(function (m) { return m.slice("showLocateHint('".length, -2); });
['NEAREST_ON_HINT', 'FINDING_HINT'].forEach(function (name) {
  var v = (src.match(new RegExp('var ' + name + "\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'")) || [])[1];
  if (v != null) hintLits.push(v);
});
t.eq(hintLits.length >= 4, true, 'the chip strings were actually found');
var walkHints = hintLits.filter(function (h) { return /shortest walk/i.test(h); });
t.eq(walkHints.length, 1, 'exactly one chip names the walk order');
t.eq(/location off/i.test(walkHints[0] || ''), true,
     'and it is the location-off chip - the only state that order can be reached from');
// setNearest shows no chip of its own: both callers know something it does
// not - whether a fix exists, whether the driver just switched off.
var setNearestSrc = (src.match(/function setNearest\(on\)\{[\s\S]*?\n\}/) || [''])[0];
t.eq(/showLocateHint/.test(setNearestSrc), false,
     'setNearest leaves the wording to its callers');
// THE LIST BEFORE THE CAMERA. render ends on the capped path in
// syncMapPadding, and HERE's setPadding recomputes the view from its
// COMMITTED look-at data - discarding a setCenter issued moments earlier in
// the same task and not yet applied. Recentring first made the tap silently
// fail to move the map. Pinned as an ordering, because that is what it is.
var watchCb = (src.match(/watchPosition\(function\(pos\)\{[\s\S]*?\}, function\(err\)/) || [''])[0];
t.eq(watchCb.indexOf('refreshNearest()') !== -1 &&
     watchCb.indexOf('refreshNearest()') < watchCb.indexOf('map.setCenter('), true,
     'the fix refreshes the list BEFORE it moves the camera');
// A moving truck must not rebuild the panel on every GPS tick and yank the
// row out from under a thumb.
t.eq(/var NEAREST_REFRESH_MI = \d+;/.test(src), true,
     'a distance threshold gates the re-sort');
t.eq(/function refreshNearest\(\)\{[\s\S]*?scrollTop = top;/.test(src), true,
     'a re-sort keeps the scroll position: the rows shuffled, they did not change');
// ---- the locator overlays HERE's logo, deliberately (v4.14.0) ----
// This inverts what v4.12.0 and v4.13.0 pinned, and the inversion is the
// point: covering that logo is a licence trade-off the owner asked for, so
// it is asserted rather than merely allowed. A future change that quietly
// restores the clearance should fail here and be argued for, not land as a
// tidy-up.
t.eq(/#locateBtn\{position:absolute;left:10px;/.test(src), true,
     'the locator sits in the corner, over the logo, by explicit request');
// z-index STATED, not inherited from the fact that #locateBtn happens to
// follow #map in the markup. Reordering the stage would silently put the
// logo back on top of it.
t.eq(/#locateBtn\{[^}]*z-index:601/.test(src), true,
     'and is on top by declared z-index rather than by DOM order');
// The clearance measurements are GONE, not left unread. A measurement
// nothing consumes reads as a live constraint while enforcing nothing.
t.eq(/setProperty\('--attrib-[wh]'/.test(src), false,
     'no attribution measurement survives with nothing reading it');
t.eq(/var\(--attrib-[wh]/.test(src), false, 'and nothing reads one');

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
