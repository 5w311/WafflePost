# WafflePost

Every Waffle House in America you can walk to from a truck stop. Single-page
app, no build step, deployed to GitHub Pages. Needs a HERE key to draw the
map; the atlas itself is computed from local data and needs no network.

A sibling of [FuelPost](https://github.com/5w311/FuelPost) — same shape, same
discipline, different question. FuelPost answers *where am I allowed to fuel*.
WafflePost answers *can I get a plate of hashbrowns without moving the truck*.

Two tabs:

- **Atlas** — map and list of all 67 exits, filterable by corridor, state,
  truck stop chain, walk distance and free text. Every row, distance and
  filter is computed locally; only the basemap under the pins is fetched.
- **Route** — pickup, delivery, vehicle profile. Get a truck route from HERE
  and every Waffle House on the atlas that sits near it, in the order you pass
  them, with the mile marker and how far off the road each one is.

## Layout

```
index.html                the app — markup, styles, DATA array, map + UI wiring
lib/waffledist.js         haversine, walk time, tier bands, mile formatting (no DOM, no network)
lib/atlasfilter.js        pure passes() predicate + the filter badge count
lib/routewaffles.js       projects atlas rows onto a route polyline (no DOM, no network)
lib/vehicleprofile.js     truck dimensions/hazmat -> HERE vehicle[...] params (no DOM, no network)
lib/triptext.js           formats a stop or a planned run for share/save
lib/escape.js             HTML-escapes strings before they reach innerHTML
lib/autosuggest.js        address-suggestion helpers, vendored from FuelPost
lib/location.js           GPS fix labelling/precision, vendored from FuelPost
lib/routeoptions.js       alternative-route naming, scoring and de-duplication
lib/baselayer.js          which base layer a theme wants, or null for leave-it-alone
lib/flexible-polyline.js  HERE's reference decoder, vendored unmodified (MIT)
test/*.test.js            plain-node tests, no framework
test/_assert.js           three assertions; that is the whole framework
test/run.js               runs every test file and reports a combined total
data/atlas.csv            the audit's own source table, with coordinates
```

`lib/` is CommonJS so the tests run under plain `node` with no install and no
build step, exactly as in FuelPost. `index.html` loads them as classic scripts
behind a shim.

**The shim is three lines longer than FuelPost's, on purpose.** FuelPost's
`lib/` files are mostly independent, so a bare `module.exports` capture between
script tags is enough; the one module that `require`s another needed its own
function-scope fetch. Here every module except `escape.js` depends on
`waffledist.js`, so the page defines a two-line `require()` that reads from a
`__mods` object populated between script tags. It resolves `./name` and
`./name.js` and nothing else, which is all this dependency graph is. No
bundler, no build step, and the same rule as FuelPost applies: **do not add
`defer` to the lib scripts.** The inline captures between them are not
deferred, so every module would silently become `{}` with no error thrown
anywhere. `test/structure.test.js` fails if `defer` or `async` appears on one.

## Where the data came from

Every row is the output of an exit-by-exit audit of the interstate system:
seed the Waffle House exits for a corridor from an exit guide, intersect with
truck stop exits, then verify **each survivor** by pulling both coordinates and
computing the distance rather than trusting the guide's own distance column.
That last step is the whole method. Exit guides list distance from the ramp,
which routinely puts a Waffle House and a truck stop at "0.2 mi" each when
they are on opposite sides of a mile-wide interchange.

Counts, reconciled, because three different numbers are all correct about
different things:

- **67 exits** — rows in `DATA`. 66 walkable plus one honorary member.
- **78 pairings listed** — every truck stop named, including the second,
  third and fourth stop at exits that have them.
- **73 pairings within 0.4 mi** — the headline number. The other 5 are
  alternates that sit past the line and are labelled *(past the line)* in the
  stop sheet rather than dropped, because at 3am a 3,274 ft walk you know
  about beats a 1,498 ft walk into a full lot.

`WALKABLE_FT` is 2,112 — 0.4 mi. One row (Bishopville SC, 0.45 mi) sits past
it and is admitted anyway as **honorary**, on the strength of a driver review
saying in plain words that truckers walk it. `test/data.test.js` asserts there
is exactly one such row and that it carries its evidence in `note`.

## Tier bands

Pin colour is walk distance, not brand — distance is what this app is about,
and a legend nobody opens should not be load-bearing. The bands run light to
dark as the walk gets longer:

| Tier | Range | Reading |
|---|---|---|
| Front porch | ≤ 500 ft | You can see the truck from the counter |
| Short walk | ≤ 1,000 ft | Across a lot and a frontage road |
| Long walk | ≤ 2,112 ft | A real walk, still inside the line |
| Honorary | past 2,112 ft | Admitted on driver evidence only |

The tier filter is a **ceiling, not a band**: "Short walk" shows everything up
to 1,000 ft including the front-porch stops, because a driver setting a
maximum walk wants everything at or under it. `test/atlasfilter.test.js` pins
this, since the opposite reading is the obvious way to get it wrong.

## Amenity filters: unknown is not the same as false

Feet, corridor, exit, chain and coordinates were verified for all 67 rows.
Amenity detail — free parking, a CAT scale, a sit-down diner — was only
recorded where a review or the stop's own listing confirmed it, because
chasing every amenity across 67 exits was not what the audit was for.

So those three toggles filter to **"confirmed by the audit"**, never to "has
it". A stop without the flag may well have a scale and simply was never
checked. The UI labels them "Confirmed …" and says so in the filter panel.
Do not relabel them to plain "Has parking" without going back and verifying
all 67 exits — a filter that silently reads unknown as no would hide good
stops and a driver would never know why.

The `caution` flag works the other way and is never hidden by default:
Marshall TX and Beaumont TX both show in every unfiltered list, marked
**read first**, because the thing a driver needs to know about those stops is
worth a row rather than an omission.

## The key draws the map now

Through 2.x the Atlas tab called nothing — Leaflet with CARTO's free basemap
tiles — and a fork of this repo deployed with no account and no key. **v3.0.0
ends that.** The map is HERE Maps JS 3.1, `H.service.Platform` authenticates
with `HERE_API_KEY`, and an empty key costs the basemap on *both* tabs.

What did not change is where the atlas itself comes from. Every distance,
tier, filter and walk strip is still computed client-side against `DATA`, and
the rows, the panel and the stop sheets all read correctly with no network at
all. An empty key costs the basemap under the pins, not the atlas — the map
area says what is missing and everything else works.

That degradation is deliberate and guarded, not automatic: `H.service.Platform`
**throws** on an empty `apikey` ("Argument #0 apikey must be specified"), so an
unguarded construction would abort the whole inline script and take the atlas
down with the map. `MAP_ON` is what keeps a keyless build usable. Since 3.0.1 a
key ships, so that path is not the shipped state — it is what a fork gets the
moment it blanks the key to paste its own, and it is why doing so degrades
rather than breaks.

The trade was deliberate. One map vendor across WafflePost and FuelPost means
one set of quirks to know and one place the scar tissue accumulates, instead
of two — and it buys satellite imagery, which this app has a specific use for:
its whole claim is that a walk is walkable, and a road map does not show a
fence, a drainage ditch, or a kerb with no gap in it.

## Route mode

Route is the one mode that talks to a *routing* API, and it is gated so the
rest of the app never depends on it.

**Setup, for a fork:**

A working key ships in `HERE_API_KEY` at the top of the app script, so a
clone of this repo runs as-is. To point a fork at your own HERE account,
replace it and **restrict the new key to your own domains in the HERE console
first**.

The key being committed is deliberate, and it reversed the earlier rule.
Through 2.x the key was Route's alone: shipping blank disabled one optional
tab, and `structure.test.js` failed if a real one was ever committed. From
3.0.0 the map itself authenticates with it at load, and GitHub Pages serves
this repo verbatim with no build step to substitute one at publish time — so
a blank key means the published site can never draw a map. 3.0.1 committed
one and inverted the test, which now fails if the key goes *missing*.

None of that is a change in what is protected. A client-side map app cannot
hide a key: it sits in the served JavaScript, readable by anyone who opens
the tab, whichever way it got there. Domain restriction is what makes
publishing one survivable, and secrecy never was. If a key needs replacing,
rotate it in the console rather than trying to scrub it from git history.
There is no third step any more. `lib/flexible-polyline.js` used to ship as a
placeholder that threw, with a `cp` command in its header; it now holds HERE's
own reference decoder, vendored unmodified from
[heremaps/flexible-polyline](https://github.com/heremaps/flexible-polyline)
and covered by `test/polyline.test.js` against HERE's published test vector.

Vendoring rather than reimplementing is deliberate. A decoder is exactly the
kind of code that looks right, passes a hand-written test, and then puts a
route in the wrong hemisphere on some real response nobody thought to try —
and this repo has no way to call HERE and check. FuelPost's copy has been
reading live responses in production for many versions. One decoder between
the two apps, not two that can drift.

### What it shows

Every atlas row near the route, in the order you pass them: the mile marker,
how far off the road it sits, and the same walk strip the Atlas list uses. No
plan, no recommendation, no ranking — the driver knows which stop suits the
load, and this only knows which ones exist.

**There is deliberately no range input.** No "how far do you run", no tank
gauge, no hours-of-service arithmetic. Those belong to a fuel plan, where the
constraint is real and the app can compute against it. Here the honest output
is the list, and inventing a "recommended" stop out of assumed speed and
assumed hours would dress a guess up as a plan.

**Detour tiers are `[1, 3, 6]` miles**, deliberately much tighter than
FuelPost's `[8, 15, 30, 50]`. Nobody drives thirty miles off route for
hashbrowns. The tight tier is tried first and only widens if it found nothing
at all, and the panel says so when it widened — a run with three pairs within
a mile should never have its list padded with stops six miles off the road.

### Vehicle profile

Kept in full, because it is the part of FuelPost's route mode that changes
which roads come back. Standard, Hazmat, or Custom, in the trip drawer.

- **Standard** (default) — 13'6" × 8'6" × 70 ft, 80,000 lb: the federal
  maximums for a 5-axle rig. A driver who never opens the control still gets
  full dimensional routing.
- **Hazmat** — the same dimensions plus declared hazard classes.
- **Custom** — your own numbers; a blank field falls back to the standard
  value, so changing one number does not mean typing four.

`transportMode=truck` **on its own applies no dimensions at all.** HERE's docs
are explicit that absent vehicle parameters default to "0 or none": general
truck access rules apply and nothing dimensional does, so a 13'6" truck can be
routed under a 12' bridge. FuelPost learned this at v1.14.0; it is applied here
from the first version with a route tab.

Three decisions that look like details and are not, all pinned by
`test/vehicleprofile.test.js`:

- **Conversions round UP, never to nearest.** Under-declaring makes HERE
  believe the truck fits where it does not; over-declaring at worst costs a
  slightly longer legal route. Those errors are not symmetric. 102 in ceils to
  260 cm — exactly the 2.6 m that 23 CFR 658.15 names as the metric equivalent
  of the 102-inch limit, so rounding to nearest would under-declare against the
  regulation's own wording.
- **Hazmat is a class multi-select defaulting to all classes on.** HERE does
  not infer between classes: declaring gas does not exclude roads barred to
  flammables. Deselecting the last class re-selects them all rather than
  silently sending none.
- **Validation blocks planning rather than warning.** A typo'd height is
  exactly the input that produces a confident illegal route, and a warning next
  to a route that still drew would be read as a route.

**The untestable surface is forty lines.** Two GET calls, geocode and routing.
Everything downstream — projecting stops onto the polyline, the mile markers,
the detour tiers, the vehicle parameters — is pure, lives in `lib/`, and is
covered by tests that run under plain `node` with no key and no
network. `test/structure.test.js` asserts there are exactly two `fetch(` calls
in the app script, so that surface cannot quietly grow.

## Tests

```
node test/run.js              # everything
node test/data.test.js        # just the atlas rows
```

No dependencies, no install step. `data.test.js` parses `DATA` and `BRAND` out
of `index.html` rather than keeping a fixture copy — a fixture drifts, and the
point is to catch a real row going in wrong. It checks every row for a
plausible corridor, a two-letter state, a known brand, known flags,
coordinates inside a continental-US bounding box (which catches the
sign-flipped or transposed coordinate that would otherwise look reasonable),
that the primary stop is the closest one at its exit, and that `DATA` is
stored shortest-walk-first so the file itself reads as the leaderboard.

## Two version strings, on purpose

Same reasoning as FuelPost, different perishable thing:

- **`ATLAS_REV`** (`Atlas Rev 08-2026`) — which edition of the walkability
  audit the rows came from. Shown in the **header**, because stores open and
  close: Troutville's did not exist a year before this revision, and a pair
  that has closed is a wasted exit at 3am. A driver cannot tell stale atlas
  data from current atlas data without it. Bump only when the rows are
  re-audited.
- **`APP_VERSION`** (`3.3.0`) — the code. Shown in the **legend card**.
  Bumped for every shipped change, and stamped onto every `lib/` URL as a
  cache-buster.

## Persisted settings (localStorage)

`wafflepost.theme.v1` is the only thing this app persists, and it follows the
discipline FuelPost set: version the key itself, store only genuinely explicit
choices (no stored value already means "follow system"), treat anything read
back that is not one of the expected values as absent, and bump to `.v2`
rather than reuse the key if what "unset" resolves to ever changes.

One addition: **every `localStorage` access here is wrapped in try/catch.**
Sandboxed iframes and private browsing throw on access rather than returning
null, and a theme preference is never worth a blank screen. In that case the
choice simply does not persist, which is the correct degradation.

## Version history

### v3.3.0

**The map follows the theme now, reversing v3.0.0's most deliberate decision.**
That release shipped one fixed base layer and no theme machinery at all,
specifically to sidestep the satellite-versus-dark-mode interaction that took
FuelPost five releases — and it said so, naming the exact cost: no `mapnight`,
no `setBaseLayer` choke point, no `baselayerchange` listener, no control
rebuild. The reason for taking it on anyway is the one that release itself
predicted: the bright day map reads badly in a cab at night.

What made it affordable was reading what those five releases actually cost.
**Four of them chased a timing race that was never there.** FuelPost's own
release notes record v1.11.6–v1.11.9 adding deferral, then idempotency, then
internal bookkeeping, against a defect that was none of those things: the
theme handler swapped the base layer without ever asking what the map was
currently showing. Switch the theme while looking at Satellite and it yanked
you back to the road map.

So the whole feature is one conditional, in `lib/baselayer.js`:
`nextBaseLayer()` returns `null` — leave it alone — for anything that is not
one of the two themed road layers. It is an **allow-list by identity**, never
a deny-list naming satellite, because a check for "is this satellite" needs
updating every time HERE adds a layer and is wrong until someone notices.
Returning `null` when the layer is already correct is also what makes the
`baselayerchange` backstop self-terminating rather than a feedback loop.

The rest is ordinary plumbing, kept because the SDK earns it: a **deferred,
coalesced, idempotent** choke point (HARP rebuilds its entire theme
asynchronously on a swap — disposing the tile source, evicting every texture
cache, flipping the canvas clear colour — and landing a second swap inside
that window is what the sibling app reported twice on real phones), and an
**unconditional control rebuild** on every theme change, because the layer
switcher matches the map's current layer by identity and a stale entry makes
it highlight *nothing at all*. The scale-bar re-add now runs on every rebuild
rather than once, so getting its order wrong would move the button every time.

Verified in a browser across every path, including the two that fire with no
user action: an OS dusk transition while "System" is selected swaps the map,
and an OS dusk transition **while the driver is on Satellite leaves them on
Satellite**.

**The trip drawer collapses both ways.** Its tab only ever expanded — a plan
collapsed the form automatically, but reopening it to fix one address stranded
it open over the map until the next successful plan. It now toggles like the
results panel beside it, with the same chevron, and collapsing hands ~275px of
height back to the map.

**Typing no longer zooms the app on iOS.** Safari zooms the page whenever a
focused form control computes under 16px, and the body font is 15 — so every
text box in the app was one pixel short of the threshold. Form controls are
now 16px. The other fix, `maximum-scale=1` on the viewport meta, was rejected:
it kills pinch-zoom for everyone, including a driver trying to read a lot
layout at night, to solve what one font-size solves.

### v3.2.0

**Alternative routes, ranked by what this app is actually for.** The routing
request now asks HERE for alternatives, and every option that comes back is
scored against all 67 atlas rows before the chooser renders. Each card leads
with its walkable-pair count, because on this app a different route is not
merely faster or slower — *it passes different Waffle Houses*.

That is not a slogan; it is measurable. Atlanta → Nashville returns two options
that each pass **four** walkable pairs and share **none** of them
(Cartersville/Ringgold/Murfreesboro/La Vergne versus
Temple/Good Hope/Priceville/Columbia). Dallas → Atlanta is starker still: HERE's
own pick (I-20, 782 mi) passes 5, while I-49/I-65 at 968 mi passes **13**.

**HERE's ordering is kept, deliberately.** The list is not re-sorted by pair
count. A fuel gap is disqualifying — FuelPost sorts on it for that reason —
but "fewer waffles" is not, and promoting a +186 mi route to the top of a list
a driver plans real runs from is bad driving advice. Instead the difference is
made legible: the pair count is the largest thing on every card, every later
card carries its true mileage cost (`+186 mi`), and a `most waffles` badge
appears only when a slower option genuinely beats the fastest one.

**The unchosen routes are drawn, faded.** FuelPost deliberately does not do
this; its options differ on a fuel-network fact invisible on a map. These
differ *geographically*, and the map is the only place "these two routes are
disjoint" is legible at a glance.

**One shared detour tier across all options.** `stopsAlongRoute` widens
[1, 3, 6] independently per polyline and returns the first tier that finds
anything — so scoring options separately would print "4 pairs" beside
"3 pairs" with the first measured at 1 mile and the second at 6. New
`lib/routeoptions.js` picks the tightest tier that finds a pair on *any*
option and scores them all at it, so an option with nothing close honestly
shows zero. Every route on every lane tested resolved at tier 1, so this would
never have shown up in casual testing.

`projectStops` gained a per-segment bounding-box reject: 67 rows against
~8,000 segments is half a million distance calls per route, and alternatives
multiply that by the option count. Measured 3.3× faster on five
cross-country-scale routes, verified output-identical across 507 differential
comparisons including ties, zero-length segments and polar latitudes.

Switching options is a pure re-render — every alternative is decoded, measured
and scored when the run is routed, so a tap costs no network at all.

Also fixed: the endpoint pins now come from the geocoded addresses rather than
being re-derived from the polyline's first and last vertices, which are the
points HERE snapped the route to. With one route that drift was invisible;
with a chooser it would have moved on every switch.

### v3.1.0

**The pickup and delivery boxes now match FuelPost's.** Each is a labelled
combobox with HERE Autosuggest under it, a per-field clear, and — on pickup —
a "use my current location" button. `lib/autosuggest.js` and `lib/location.js`
are vendored from FuelPost unmodified, so the decidable parts have one
implementation between the two apps rather than two that can drift.

Tapping a suggestion, or filling from GPS, resolves that end to real
coordinates immediately, so `planRoute` **skips the forward geocode for it** —
picking a specific suggestion is exactly what resolves the ambiguity a geocode
would otherwise guess at. Editing the text afterwards drops that resolution
and hands the field back to geocode-on-plan. Verified end to end: a plan with
both ends tapped from suggestions fires the routing call and no geocode call
at all.

Autosuggest is debounced 300ms behind a 3-character minimum, and both numbers
are call-volume decisions rather than UX ones: it fires per keystroke where
geocode and routing fire once per plan, and the key is public. The dropdown is
plain `position:absolute` under the input — no JS-computed coordinates, so it
pans with the field when the on-screen keyboard moves the visual viewport —
and `.drawer-body`'s `overflow-y:auto` is lifted only while a list is open.

Roles only, no arrow-key navigation: this is about screen-reader legibility on
a phone-first app, and it matches what FuelPost ships.

`structure.test.js`'s network-call count moves from 2 to 5 — geocode, routing,
autosuggest, lookup, revgeocode — all still inside Route. The Atlas tab calls
nothing beyond its basemap. Lib count moves from 7 to 9.

Not ported: FuelPost's geocode candidate picker, which is a separate feature
from the fields themselves.

### v3.0.1

**Ships a HERE key, because 3.0.0 shipped a site that could not draw a map.**
The migration moved the basemap onto HERE without moving the key with it: the
map authenticates at load, GitHub Pages serves this repo verbatim, and there
is no build step to substitute a key at publish time — so the published site
showed the "No map key" panel and nothing else could change that. The guard
was working correctly; there was simply no path for a key to reach production.

`structure.test.js` inverted with it. The old assertion (`HERE_API_KEY` must
ship empty, "never commit a real one") was written when the key was Route's
alone and a blank one cost one optional tab. It now fails if the key goes
*missing* instead. What is protected did not change: a client-side map app
cannot hide a key either way, and domain restriction is what makes publishing
one survivable.

`MAP_ON` stays exactly as 3.0.0 left it — it is now what a fork gets the
moment it blanks the key to paste its own.

### v3.0.0

**The map is HERE Maps JS 3.1 on the HARP engine.** Leaflet and CARTO are
gone: the CDN stylesheet and script, the `TILES` object, the `ATTR` string,
`setTiles`, and every `L.` call with them. One map vendor across WafflePost
and FuelPost, so there is one set of quirks to know rather than two.

**The map does not follow the theme, on purpose.** Light / Dark / System still
theme the chrome exactly as before; the map is one fixed base layer
(`vector.normal.map`) set at construction and never changed again. That single
decision deletes the whole class of machinery FuelPost accumulated around it —
no `mapnight` constant, no deferred idempotent `setBaseLayer`, no
`baselayerchange` listener, no rebuilding a control on theme change, no
preserving centre and zoom across a layer switch. `applyTheme` no longer
references the map at all. With dark chrome the map stays the bright day map;
if that ever reads badly in a cab at night, the fix is one constant.

**Satellite, and no traffic.** The layer switcher is built once from
`H.ui.MapSettingsControl`'s public config object, naming its own `baseLayers`;
omitting the optional `layers` array is what drops the traffic checkboxes. The
scale bar is re-added *after* the button so the bottom-right anchor keeps its
original child order, and it reads in miles (`setUnitSystem(IMPERIAL)`).

**Pins land on their coordinate.** HERE's `DomIcon` has no anchor option, and
it writes its own inline transform onto whatever element it is handed —
silently overwriting a CSS transform on that same element. So the anchor
translate moved one level deeper, onto a wrapper HERE never touches, with the
pin's own rotate inside that. One `DomIcon` per distinct appearance (tier
crossed with brand letter, up to 28 across 67 markers), memoized; markers are
built once at startup in `DATA` order, and filtering flips `setVisibility`
instead of rebuilding 67 markers on every keystroke.

**Viewport.** A window resize listener and a `ResizeObserver` on the map
element, both debounced 120ms, call `getViewPort().resize()` and sync padding —
the canvas cannot see its own container change height, and the drawer and panel
both change it. The old 260ms `setTimeout(invalidateSize)` calls are gone.
Route fits apply the panel's measured height as bottom padding, so the delivery
end no longer lands behind the panel, and the panel is rendered *before* the
fit so it measures this plan's panel rather than the previous one's. The atlas
is fitted once at startup and never automatically again.

**`lib/flexible-polyline.js` is real.** HERE's reference decoder, vendored
unmodified, replacing the placeholder that threw — with `test/polyline.test.js`
(25 assertions) against HERE's published test vector. Route mode can decode
geometry for the first time.

The seven `lib/` modules are untouched and none gained a map dependency.
`ATLAS_REV` is unchanged; no atlas data moved.

### v2.0.0

**Cut back to two tabs: Atlas and Route.** Near me and Corridor are gone, and
so are `lib/corridor.js`, `lib/nearby.js`, `lib/breakplan.js` and their tests —
deleted rather than left in place unreferenced, because dead code in a repo
this size reads as a feature someone forgot to wire up.

Route lost its range inputs with them. Hours-left and planning-mph produced a
"park here" recommendation built on two assumed numbers; the honest output is
the list of what is actually on the route, and that is now all it returns.

**The vehicle profile stayed and grew up.** New `lib/vehicleprofile.js`
(Standard / Hazmat / Custom, ceil-rounded unit conversions, sanity rails that
block rather than warn, 21 tests) feeds `vehicle[...]` parameters into every
routing request. The trip drawer collapses to a summary tab when a plan renders
and expands again on an error, the way FuelPost's does.

`formatMiles` moved from the deleted `nearby.js` into `waffledist.js`.
`triptext.js` swapped its corridor formatter for a route one.
`test/structure.test.js` now fails if a third mode tab appears, if an hours or
mph input comes back, or if the vehicle profile stops reaching the routing call.

### v1.1.0

**Route mode.** Truck route from HERE, atlas pairs projected onto it, and the
furthest walkable Waffle House reachable before the hours run out. The three
existing modes are untouched and still call nothing — a missing key disables
exactly one tab and explains itself in that tab rather than failing at the
first fetch.

New pure modules: `lib/routewaffles.js` (point-to-segment projection on a local
equirectangular frame, cumulative mile markers, adaptive detour tiers) and
`lib/breakplan.js` (furthest-reachable pick, fallbacks, gap, dry stretch). 44
new tests, all runnable with no key and no network.

One bug the tests found before any browser did: `planBreak` bounded reachable
stops by the clock but not by the delivery, so a 300-mile load with an 11-hour
clock listed pairs at mile 430 and 590 as reachable. Both are past where the
truck stops existing on that run. Now capped by whichever comes first, clock or
delivery.

`lib/flexible-polyline.js` ships as a placeholder that throws with instructions.
See *Route mode* for why it is not reimplemented here.

### v1.0.0

First release. Atlas, Near me and Corridor modes over 67 audited exits.

The signature element is the **walk strip** — the proportional bar under every
list row and across the stop sheet, with the 0.4 mi line marked on it. It
exists because the entire app is about a distance most people cannot picture:
"205 feet" and "2,392 feet" read as similar-sized numbers and are not similar
walks. The strip is drawn on a **fixed 2,500 ft scale across every row**, never
per-row, so bars are comparable down the list; a per-row scale would render
Good Hope and Bishopville at the same length, which is the one thing this app
must never do.

Markers are built once at startup and filtering flips layer membership, rather
than rebuilding 67 markers on every keystroke — the same lesson FuelPost
learned at v1.19.5, applied up front here rather than after a phone found it.
