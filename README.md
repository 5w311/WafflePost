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
- **Route** — pickup and delivery with address autosuggest and a "use my
  current location" button on pickup, plus a vehicle profile. Get up to five
  truck routes from HERE, each scored by how many walkable Waffle Houses it
  passes, and for the option you pick, every atlas row near it in the order
  you pass them, with the mile marker and how far off the road each one is.

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
test/_assert.js           two assertions and a reporter; that is the whole framework
test/run.js               runs every test file and fails the run if any file fails
data/atlas.csv            the audit's own source table, with coordinates and addresses
apple-touch-icon.png      iOS home screen, 180x180 - the header tile, baked
icon-192.png              Android home screen
icon-512.png              Android, large
icon-maskable-512.png     Android, padded for a launcher that crops to a circle
favicon-32.png            browser tab, 32x32
favicon-16.png            browser tab, 16x16
manifest.json             app name, icons, standalone display - no service worker
```

`lib/` is CommonJS so the tests run under plain `node` with no install and no
build step, exactly as in FuelPost. `index.html` loads them as classic scripts
behind a shim.

**The shim is three lines longer than FuelPost's, on purpose.** FuelPost's
`lib/` files are mostly independent, so a bare `module.exports` capture between
script tags is enough; the one module that `require`s another needed its own
function-scope fetch. Here four of the eleven modules `require` another —
`atlasfilter`, `routewaffles` and `triptext` pull from `waffledist`, and
`routeoptions` pulls from `routewaffles` — and the app script `require`s
`flexible-polyline` at its call site inside `truckRoute`, so the page defines a
two-line `require()` that reads from a `__mods` object populated between script
tags. It resolves `./name` and `./name.js` and nothing else, which is all this
dependency graph is. No bundler, no build step, and the same rule as FuelPost
applies: **do not add `defer` to the lib scripts.** The inline captures between
them are not deferred, so every module would silently become `{}` with no error thrown
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
- **73 pairings within 0.4 mi** — the headline number. The other 5 sit past
  the line. Four are alternates, labelled *(past the line)* in the stop sheet
  rather than dropped, because at 3am a 3,274 ft walk you know about beats a
  1,498 ft walk into a full lot. The fifth is Bishopville's own primary stop
  at 2,392 ft — the honorary row below, which carries no such label because
  the tag is only emitted on alternates.

`WALKABLE_FT` is 2,112 — 0.4 mi. One row (Bishopville SC, 0.45 mi) sits past
it and is admitted anyway as **honorary**, on the strength of a driver review
saying in plain words that truckers walk it. `test/data.test.js` asserts there
is exactly one such row and that it carries its evidence in a flag or a `note`.

## Addresses are derived, coordinates are audited

Each row carries an `addr` string — the Waffle House's street address — and it
is what the stop sheet's info section prints. Coordinates have not gone
anywhere: they still place the pin, project the row onto a route, and are what
`feet` was measured between. The address is the human-readable face of the
same point, because `34.11486, -86.86387` is not something a driver reads off
a screen to a dispatcher.

The **share text keeps the coordinates**, deliberately. That text is pasted
into other things rather than read, and a coordinate pair is the one form that
drops into any nav app or dispatch field without being re-geocoded into an
approximation of itself.

**The coordinate marks the Waffle House, not the truck stop.** That was
verified rather than assumed: a POI search at the stored coordinate returns
the Waffle House itself at a median of 6 metres, and on the two rows whose
`note` happens to quote a street number the address agrees with it — Marianna
FL's note says *"the store is 2215"* and the address is 2215 Highway 71;
LaPlace LA's says *"4301 Main St and 4304 Main St"* and the address is 4304.

Their provenance is weaker than everything around them, and that matters here
in the same way the amenity flags do. The coordinates and `feet` were audited
by hand, exit by exit. The addresses were **generated**: 44 of the 67 came
from a POI match on the Waffle House itself, the other 23 from the street
address at the coordinate. Every one was checked to start with a house number
and to name the row's own state — which catches the reverse-geocode landing
across a state line, the error that would otherwise look entirely plausible —
and `test/data.test.js` pins both checks. But none of them was verified
against the ground the way the coordinates were. Treat a surprising address as
suspect before you treat the coordinate as wrong.

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

### The map follows the theme, and never overrules the driver

Light / Dark / System theme the map as well as the chrome: `vector.normal.map`
under light, `vector.normal.mapnight` under dark, swapped on every theme
change — including an OS dusk transition with "System" selected, which needs
no tap at all. v3.0.0 deliberately shipped one fixed layer to sidestep exactly
this; the bright day map genuinely reading badly in a cab at night is why
v3.3.0 took it on anyway.

The whole feature is one conditional, in `lib/baselayer.js`. `nextBaseLayer()`
returns `null` — leave it alone — for any layer that is not one of the two
themed road layers, so a driver looking at Satellite when the sun goes down
**stays on Satellite**. It is an allow-list by identity, never a deny-list
naming satellite, because a check for "is this satellite" needs updating every
time HERE adds a layer and is wrong until someone notices. Returning `null`
when the layer is already correct is also what makes the `baselayerchange`
backstop self-terminating rather than a feedback loop.

Everything else is plumbing the SDK earns. Every base-layer change goes through
one deferred (60ms), coalesced, idempotent choke point, because HARP rebuilds
its whole theme asynchronously on a swap — disposing the tile source, evicting
every texture cache, flipping the canvas clear colour — and landing a second
swap inside that window is the failure the sibling app reported twice on real
phones. The idempotency check sits *inside* the timer on purpose: whoever got
there first wins, including the driver's own tap on the layer switcher.
`test/structure.test.js` pins that there is exactly one `setBaseLayer` call
site and that the theme asks `nextBaseLayer` before using it.

**Satellite is a control, not just a rationale.** The layer switcher sits at
the bottom right of the map and offers exactly two entries, *Map view* and
*Satellite*. It is built from `H.ui.MapSettingsControl`'s public config object
rather than taken from `createDefault`, whose own "Map view" entry is
hardcoded to the light layer with no theme awareness; naming `baseLayers` and
omitting the optional `layers` array is what leaves the traffic checkboxes
out, and traffic is not part of what this app does. The scale bar beside it
reads in miles, and is re-added *after* the button, because that anchor
prepends and the reversed order slides the button to roughly the centre of a
phone screen. The control is rebuilt on every theme change — it matches the
map's current layer by identity, so a control still naming the day layer while
the map is on `mapnight` highlights *nothing at all* — and that rebuild
happens even while the map sits on Satellite and no layer is being touched.

The engine is pinned to HARP in both `createDefaultLayers` and the `H.Map`
options, and Satellite is part of why: under the WEBGL fallback HERE's own
switcher renders it greyed out and unpickable, and `mapnight` does not exist
at all.

## Route mode

Route is the only mode that reaches the network at all — geocode, routing,
autosuggest, lookup and reverse-geocode — and it is gated so the rest of the
app never depends on it. The Atlas tab fetches nothing but its basemap.

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

### The trip drawer

Route's form lives in a drawer above the map, under a tab that toggles it both
ways — the same chevron, in the same direction, as the results panel below it.
Planning collapses it to a summary tab reading `pickup → delivery` alongside
the vehicle profile; an error expands it again so the field that needs fixing
is on screen. Tapping the tab, or Enter/Space on it, does the same by hand,
which is the part the automatic behaviour alone could not cover: reopening the
form to fix one address used to strand it open over the map until the next
successful plan. Collapsed, it hands the whole form's height back to the map.

Nothing calls `resize()` when the drawer moves. A `ResizeObserver` on the map
element sees the height change and handles it, debounced 120ms, along with
every other cause — HERE's canvas cannot see its own container change size,
and hand-wiring a call at each height-changing site means missing the next
one. The one exception is the route fit, which resizes synchronously first
because the drawer collapses in the same frame and the debounced pass would
otherwise fit against a viewport HERE still believes is ~200px shorter.

**Form controls are 16px, and that is not a style choice.** Safari zooms the
page whenever a focused control computes under 16px, and the body font is 15 —
so every text box in the app was one pixel short of the threshold. Do not
normalise them back to the body size. The other fix, `maximum-scale=1` on the
viewport meta, was rejected: it kills pinch-zoom for everyone, including a
driver trying to read a lot layout at night, to solve what one font-size
solves. Buttons are exempt, because iOS only zooms for text entry.

### The pickup and delivery fields

Each end is a labelled combobox with HERE Autosuggest under it and a per-field
clear. Three characters arm a 300ms debounce, then `/autosuggest` returns five
US results (`in=countryCode:USA`) biased at `32.5, -85.5` — the atlas's own
centre of gravity, and the same point the map opens on. HERE rejects a
context-free autosuggest call outright, so that `at` is unconditional rather
than a fallback; if one moves, move both.

Both numbers are call-volume decisions rather than UX ones: autosuggest fires
per keystroke where geocode and routing fire once per plan, and the key is
public. Responses are cached per query, and each request carries a token so a
slow reply landing after a newer keystroke is discarded instead of overwriting
it.

**Tapping a suggestion resolves that end.** It arrives with a position, so
`planRoute` skips the forward geocode for that field entirely — picking a
specific suggestion is exactly what resolves the ambiguity a geocode would
otherwise have to guess at. Editing the text afterwards drops the resolution
and hands the field back to geocode-on-plan. A suggestion with no position of
its own (HERE's `categoryQuery` and `chainQuery` items) costs one `/lookup`
call; if that still yields no position the typed text simply stands.

Roles only, no arrow-key navigation: this is about screen-reader legibility on
a phone-first app, and it matches what FuelPost ships. The dropdown is plain
`position:absolute` under the input — no JS-computed coordinates, so it pans
with the field when the on-screen keyboard moves the visual viewport — and
`.drawer-body`'s `overflow-y:auto` is lifted only while a list is open.

**"Use my current location", on pickup only.** The crosshair inside the pickup
field takes one position fix — high accuracy, 20s timeout, a 15s-old fix
accepted — reverse-geocodes it to a street address, fills the field and marks
it *Using your current location*. This app tracks nothing continuously and
shows no position dot, so there is no watch to start and nothing to switch
off: one tap, one fix, one address. Like a tapped suggestion, a GPS fill
resolves that end and skips the forward geocode. Delivery has no such button —
you are not standing at it.

Two failures are handled separately because they are different failures. A
reverse geocode that fails does not mean the fix failed, so the field falls
back to `Current location (33.7490, -84.3880)` rather than being left unusable
— coordinates still route. A fix that fails names its own cause: permission
denied, with what to do about it; position unavailable; timed out; or a
non-secure origin. "Could not get your location" tells a driver nothing about
which of those it was. `lib/location.js` holds the decidable parts and is
vendored from FuelPost unmodified.

### What it shows

Every atlas row near the route, in the order you pass them: the mile marker,
how far off the road it sits, and the same walk strip the Atlas list uses. No
plan, no recommendation, no ranking of stops — the driver knows which stop
suits the load, and this only knows which ones exist. Routes are a different
question: when HERE returns more than one, they are compared, and the panel
leads with a chooser. See *Alternative routes* below — but even there the list
keeps HERE's order and only labels the difference.

**There is deliberately no range input.** No "how far do you run", no tank
gauge, no hours-of-service arithmetic. Those belong to a fuel plan, where the
constraint is real and the app can compute against it. Here the honest output
is the list, and inventing a "recommended" stop out of assumed speed and
assumed hours would dress a guess up as a plan.

**Detour tiers are `[1, 3, 6]` miles**, deliberately much tighter than
FuelPost's `[8, 15, 30, 50]`. Nobody drives thirty miles off route for
hashbrowns. The tight tier is tried first and widens only if it found nothing
at all — a run with three pairs within a mile should never have its list
padded with stops six miles off the road.

**One shared tier across every option.** `stopsAlongRoute` widens [1, 3, 6]
independently per polyline, which applied once per route option would print
"4 pairs" beside "3 pairs" with the first measured at 1 mile and the second at
6: two different questions rendered as one comparison, with nothing on screen
saying so. So `projectAll` in `lib/routeoptions.js` picks the tightest tier
that finds a pair on *any* option and scores them all at it, and an option
with nothing close honestly shows zero rather than being quietly widened until
it has something to show. The panel says when the search widened, and whether
nothing sat within a mile of *this route* or of *any of these routes*.

### Alternative routes

The routing request asks HERE for up to 4 alternatives, so up to five routes
come back. `ALTERNATIVES` is a hardcoded literal, never derived from config,
state or input: `alternatives=7` is a hard 400, and so is a non-numeric value
— a bad number here does not lose the extras, it loses routing.
`structure.test.js` pins it inside the legal range. Four rather than six is how
deep it is worth looking: on Dallas → Atlanta the 13-pair route sits at index
4, so asking for three would drop the single best demonstration of what this
app is for, while index 5 on that lane is both longer and poorer.

Every option that comes back is decoded, measured and scored against all 67
atlas rows when the run is planned, so switching between them is a pure
re-render and costs no network at all.

Each card leads with its walkable-pair count, because on this app a different
route is not merely faster or slower — *it passes different Waffle Houses*.
Atlanta → Nashville returns two options that each pass four pairs and share
none of them; Dallas → Atlanta returns HERE's own pick at 782 mi passing 5,
and an I-49/I-65 line at 968 mi passing 13. (Measured at release; HERE's road
data drifts.)

**HERE's ordering is kept.** The list is not re-sorted by pair count. A fuel
gap is disqualifying — FuelPost sorts on it for that reason — but "fewer
waffles" is not, and promoting a +186 mi route to the top of a list a driver
plans real runs from is bad driving advice. The difference is made legible
instead: the pair count is the largest thing on every card, every later card
carries its true mileage cost (`+186 mi`), and a `most waffles` badge appears
only when a slower option genuinely beats the fastest one. With one route the
chooser is absent, not empty. With more than one it renders *above* the
empty-run message, because an option that passes nothing is exactly the one a
driver needs to switch away from.

`lib/routeoptions.js` names each option from HERE's route labels (`via I-24,
I-75` — two road numbers, because a third is noise) and drops near-duplicates,
but only when they are the same driving decision: near-identical length *and*
the same set of atlas rows. A route 186 miles longer past the same exits is
still a real choice, and one the driver gets to refuse for themselves.

**The unchosen routes are drawn, faded.** FuelPost deliberately does not do
this; its options differ on a fuel-network fact invisible on a map. These
differ *geographically*, and the map is the only place "these two routes are
disjoint" is legible at a glance. The fit is to the chosen route only —
fitting the union would shrink the road the driver actually picked to make
room for one they rejected, and ghosts running off the edge is correct.

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

**Six network call sites, all in Route, all degrading soft.** Geocode and
routing fire once per plan. A routing retry fires only when the first request
already 400'd. Autosuggest fires per keystroke behind the debounce, lookup
only for a suggestion that carries no position of its own, and revgeocode only
on tapping "use my current location". `test/structure.test.js` asserts there
are exactly six `fetch(` call sites in the app script, so that surface cannot
quietly grow — raising the number is a call-volume decision on a public key,
not a refactor. The Atlas tab still calls nothing beyond its basemap.

None of the four optional calls can take a plan down. Autosuggest failing
closes the dropdown and the field falls back to geocode-on-plan; lookup
failing leaves the typed text, which geocode-on-plan resolves; revgeocode
failing still fills the pickup, with coordinates instead of a street address.
The retry exists to keep the error message honest: a 400 used to mean only
"no legal truck route for this vehicle profile", and without a retry that
drops `alternatives` and `routeLabels` it could now also mean "HERE rejected
these request attributes" — sending a driver to fix a profile that was never
the problem.

Everything downstream — projecting stops onto the polyline, the mile markers,
the detour tiers, the option scoring, the vehicle parameters — is pure, lives
in `lib/`, and is covered by tests that run under plain `node` with no key and
no network.

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
that the primary stop is the closest one at its exit, that every row's
address starts with a house number and names the row's own state, and that
`DATA` is stored shortest-walk-first so the file itself reads as the
leaderboard.

`run.js` prints one `ok <name> N passed` line per file and then `all green`,
or names the files that failed. It does not sum the assertions — at v3.4.1
they come to 965 across twelve files, counted by hand.

## Two version strings, on purpose

Same reasoning as FuelPost, different perishable thing:

- **`ATLAS_REV`** (`Atlas Rev 08-2026`) — which edition of the walkability
  audit the rows came from. Shown in the **header**, because stores open and
  close: Troutville's did not exist a year before this revision, and a pair
  that has closed is a wasted exit at 3am. A driver cannot tell stale atlas
  data from current atlas data without it. Bump only when the rows are
  re-audited.
- **`APP_VERSION`** (`3.6.1`) — the code. Shown in the **legend card**.
  Bumped for every shipped change, and stamped onto every `lib/` URL as a
  cache-buster.

## Persisted settings (localStorage)

`wafflepost.theme.v1` is the only thing this app persists, and it follows the
discipline FuelPost set: version the key itself, store only genuinely explicit
choices (no stored value already means "follow system"), treat anything read
back that is not one of the expected values as absent, and bump to `.v2`
rather than reuse the key if what "unset" resolves to ever changes. Since
v3.3.0 that key moves the basemap as well as the chrome — see *The map follows
the theme* above.

One addition: **every `localStorage` access here is wrapped in try/catch.**
Sandboxed iframes and private browsing throw on access rather than returning
null, and a theme preference is never worth a blank screen. In that case the
choice simply does not persist, which is the correct degradation.

## Version history

### v3.6.1

**The home screen icon recolours itself in dark mode, and nothing in this
repo can stop it.** Reported on iOS 26 and investigated properly rather than
guessed at. iOS 18 and later let the home screen restyle every icon on it —
Edit > Customize > Default / Dark / Clear / Tinted — and the default,
Automatic, follows the system appearance. A web clip is a single flat raster
with no variant slots, so iOS generates the dark and tinted versions itself.
There is no markup, manifest field or asset that opts out; the only control
is that per-device setting, and it belongs to the user, not the app.

The app's own header tile was ruled out first, by pixels rather than by
reading: `--sign` and `--char` are declared once in `:root` and the dark
block never redefines them, and a screenshot of `.tile` under both schemes
diffs to an empty bounding box. It is identical light and dark.

**What did change is a trap being written down.** The obvious fix is a
second link with `media="(prefers-color-scheme: dark)"`, and it makes things
actively worse rather than doing nothing. WebKit never evaluates `media` for
touch icons — it does for `apple-touch-startup-image`, which is where the
idea comes from — so both links stay live candidates and selection falls
through to declared size. The old link declared no `sizes` at all, so it sat
on WebKit's 60px default, and a dark variant declaring 180x180 would have
outranked it and become the icon in **light** mode too.

So the link now carries `sizes="180x180"`, `structure.test.js` pins it, and
the head comment records why. That is hygiene, not a fix — the icon still
follows the phone's appearance setting, because on iOS it must.

### v3.6.0

**A manifest, which v3.5.0 declined to add one release earlier.** That entry
is still below and still says "no manifest, so this is not the first step of a
PWA" — true when written. The line it was protecting was the original brief's
*no PWA, no service worker, no offline tile caching*, and the manifest crosses
only the first inch of it: an app name, icons, and a display mode. There is
still no service worker and nothing is cached offline.

What it buys is the **home screen label on Android**. Left to itself Android
uses `<title>`, which cannot be controlled independently of the browser tab;
`short_name` is the only way to say what goes under the icon. It also lets
Android pick a properly sized icon rather than upscaling the iOS one.

**A maskable variant, because Android crops.** A launcher that masks to a
circle will clip a full-bleed glyph at the corners. The plain 192 and 512
stay full size for launchers that do not crop; the maskable 512 draws the W
smaller so its diagonal fits the centre-80% safe zone — measured at 0.745 of
the icon width against a 0.80 limit, rather than assumed. The first attempt
came out at 0.804, just over, and was redrawn.

**`display: standalone`**, deliberately. This app was already built like one:
`html` and `body` are `overflow:hidden`, the header pads for
`env(safe-area-inset-top)` and the panel for the bottom. The URL bar was only
ever taking map away from a driver.

`theme_color` is `#14110E`, the header black. `--char` is declared once and
never themed, so that single static value is correct in both light and dark
rather than a compromise between them.

`structure.test.js` now parses the manifest and follows **every** icon `src`,
because a bad path inside it costs Android the icon and says nothing. Checked
by pointing one at a missing file and watching it fail.

### v3.5.0

**The header tile is the home screen icon now.** Adding the app to a home
screen used to produce a generic icon or a screenshot of the page, because the
repo shipped no icon of any kind — no `apple-touch-icon`, no favicon, no image
assets at all. It now ships three PNGs: 180x180 for the home screen, 32 and 16
for the browser tab.

They are **baked, not reused**, and that is forced rather than chosen. The W
next to the wordmark is drawn live in whatever the device calls `system-ui` —
SF Pro on iOS, Roboto on Android, Segoe on Windows — so there is no single
"real" header W to export. The icons render Liberation Sans, Arial's metric
twin and the closest stand-in available, at 76% of the tile so the glyph fills
about 71% of the width and 52% of the height. Both were measured off the
rendered pixels rather than eyeballed: the header's own `letter-spacing:-.04em`
adds trailing space after a single character and pushed the W 2.5px right of
centre, which the icons drop.

**Square, opaque, and with no corner radius of its own.** iOS masks
`apple-touch-icon` with its own superellipse: a source that rounds its own
corners shows dark wedges through that mask, and any transparency is
composited onto black. `.tile`'s 5px radius is a header detail; on a home
screen the OS owns the shape.

**No manifest**, so this is not the first step of a PWA. Android falls back to
`apple-touch-icon` for "add to home screen", which is what was asked for, and a
manifest brings install prompts and a `display` mode this app has no use for.

`structure.test.js` asserts each link is declared **and** that the file it
points at exists. A missing icon is the quietest possible failure — the
browser 404s, shows something generic, and nothing else breaks — so the test
was checked by deleting the file and watching it fail.

### v3.4.1

**A README audit, and the two code lines it caught.** Six releases had left the
body describing an app that no longer existed: it claimed two network calls
where there are six, said every `lib/` module depends on `waffledist` when four
of eleven `require` anything at all, credited `run.js` with a combined total it
has never printed, and counted five past-the-line pairings as alternates when
one of them is Bishopville's own primary. The map theming, the trip drawer, the
address fields and alternative routes existed only in this changelog, so a
reader had to reconstruct current behaviour from release notes. Those are now
body sections.

Two fixes landed in code rather than prose. The `HERE calls` comment carried
the same "two GETs" claim the README did. And the filter panel's fine print
calls them "the three 'confirmed' filters" while only two of the three toggles
said *Confirmed* — the label was the inconsistent half, so `fDiner` now reads
**Confirmed sit-down diner**. That is the only user-visible change here, and
the reason this is a version bump rather than a docs commit.

Also corrected: `lib/routewaffles.js` claimed 185ms → 52ms across six routes
for the bounding-box reject. The benchmark that was actually run measured five
routes at roughly 150ms → 47ms. The comment now says what was measured.

### v3.4.0

**Addresses instead of coordinates, where a human reads them.** Every row
gains an `addr` string — the Waffle House's street address — and the stop
sheet's info section prints it where it used to print `34.11486, -86.86387`.
A decimal pair is not something a driver reads off a screen to a dispatcher.

The change is scoped to that one section. The **share text keeps
coordinates**: it is pasted into other things rather than read aloud, and a
coordinate pair drops into any nav app or dispatch field without being
re-geocoded into an approximation of itself.

Coordinates stay, and stay load-bearing. They place all 67 pins, they project
each row onto a route polyline in `lib/routewaffles.js`, and they are what
`feet` was measured between — the audit's own method was to compute the
distance from verified coordinates rather than trust an exit guide's distance
column. Replacing them would have cost the pins, all of Route mode, and the
verifiability of the headline number on every row, so `addr` sits alongside
them rather than in place of them.

**The coordinate marks the Waffle House, not the truck stop** — verified, not
assumed. See *Addresses are derived, coordinates are audited* above for how,
and for why these 67 strings carry weaker provenance than anything around
them. `test/data.test.js` gains three checks per row (201 assertions): the
address exists, starts with a house number, and names the row's own state.

`data/atlas.csv` gains a `waffle_house_address` column. Its rows were matched
to `DATA` **by coordinate, not by position** — the two 429 ft rows (Hubbard OH
and Ocala FL) are ordered differently in the two files, and a positional splice
would have quietly swapped their addresses.

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
comparisons including ties, zero-length segments and polar latitudes — in a
scratch harness that was not committed, so there is no test file to find.

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

Apart from the polyline decoder above, the seven `lib/` modules are untouched,
and none gained a map dependency.
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
