// OpenStreetMap side of the discovery sweep: the Overpass query, and the
// parse of its answer into the three things the sweep needs. Pure - no
// network here. scripts/discover.js does the fetch.
//
// WHY OSM. The 13-2026 campaign seeded every corridor from exit guides, and
// exit guides are where its blind spots came from: concurrencies (Florence
// KY), and stores the guides list at the wrong interchange (Hammond LA, which
// "every exit guide" puts two miles off). OSM is a different source with
// different blind spots, which is the point. It is not authoritative: a
// Waffle House can be missing from OSM, and a closed one can still be mapped.
// Nothing found here is a row. It is a lead for the judging pass and then
// for the same geocode-and-verify gate every row already went through.
//
// WHAT IS ASKED FOR, in one query, so the "near a Waffle House" filter runs
// on Overpass rather than by downloading every fuel station in America:
//   - every Waffle House in the US (brand tag, wikidata tag or exact name)
//   - every fuel station, motorway service area and HGV parking lot within
//     AROUND_M of one of them
//   - every motorway and trunk carriageway within AROUND_M, with geometry,
//     so the straight line can be tested for crossing an interstate. Oak
//     Grove MO is the reason: its Petro measures 1,298 ft and the walk is the
//     Broadway overpass.
//
// AROUND_M is 800 m, about 2,625 ft: past the 2,112 ft walkable line on
// purpose, so near misses are recorded as near misses (London OH's TA at
// 2,436 ft) instead of silently never existing.

var AROUND_M = 800;
var WAFFLE_WIKIDATA = 'Q1701206';

function overpassQuery(aroundM) {
  var r = aroundM || AROUND_M;
  return [
    '[out:json][timeout:600];',
    'area["ISO3166-1"="US"][admin_level=2]->.us;',
    '(',
    '  nwr["brand:wikidata"="' + WAFFLE_WIKIDATA + '"](area.us);',
    '  nwr["brand"="Waffle House"](area.us);',
    '  nwr["name"="Waffle House"](area.us);',
    ')->.wh;',
    '.wh out center tags;',
    '(',
    '  nwr(around.wh:' + r + ')["amenity"="fuel"];',
    '  nwr(around.wh:' + r + ')["highway"="services"];',
    '  nwr(around.wh:' + r + ')["amenity"="parking"]["hgv"];',
    ')->.ts;',
    '.ts out center tags;',
    'way(around.wh:' + r + ')["highway"~"^(motorway|trunk)$"];',
    'out geom;'
  ].join('\n');
}

// Nationwide in one request times out on every public Overpass instance
// (tested 2026-10-08: 503, 500, 504). So the fetch is two-stage: every Waffle
// House first, which is light, then the heavy around-query one tile at a time
// over only the tiles that hold a store. The `around` statements are not
// bbox-limited, so a truck stop just over a tile edge is still found.
function waffleOnlyQuery() {
  return [
    '[out:json][timeout:240];',
    'area["ISO3166-1"="US"][admin_level=2]->.us;',
    '(',
    '  nwr["brand:wikidata"="' + WAFFLE_WIKIDATA + '"](area.us);',
    '  nwr["brand"="Waffle House"](area.us);',
    '  nwr["name"="Waffle House"](area.us);',
    ');',
    'out center tags;'
  ].join('\n');
}

// bbox is [south, west, north, east].
function tileQuery(bbox, aroundM) {
  var r = aroundM || AROUND_M, b = bbox.join(',');
  return [
    '[out:json][timeout:300];',
    '(',
    '  nwr["brand:wikidata"="' + WAFFLE_WIKIDATA + '"](' + b + ');',
    '  nwr["brand"="Waffle House"](' + b + ');',
    '  nwr["name"="Waffle House"](' + b + ');',
    ')->.wh;',
    '.wh out center tags;',
    '(',
    '  nwr(around.wh:' + r + ')["amenity"="fuel"];',
    '  nwr(around.wh:' + r + ')["highway"="services"];',
    '  nwr(around.wh:' + r + ')["amenity"="parking"]["hgv"];',
    ')->.ts;',
    '.ts out center tags;',
    'way(around.wh:' + r + ')["highway"~"^(motorway|trunk)$"];',
    'out geom;'
  ].join('\n');
}

// The tiles of `size` degrees that contain at least one store, sorted so a
// rerun walks them in the same order.
function tilesFor(points, size) {
  var sz = size || 2, seen = {}, out = [];
  (points || []).forEach(function (p) {
    var s = Math.floor(p.lat / sz) * sz, w = Math.floor(p.lon / sz) * sz;
    var k = s + ',' + w;
    if (seen[k]) return;
    seen[k] = 1;
    out.push([s, w, s + sz, w + sz]);
  });
  return out.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
}

// One element -> one point. Nodes carry lat/lon; ways and relations carry a
// `center` because the query says `out center`. Anything without a usable
// coordinate is dropped rather than guessed at.
function pointOf(el) {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lon: el.lon };
  if (el.center && typeof el.center.lat === 'number') return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function isWaffleHouse(tags) {
  tags = tags || {};
  if (tags['brand:wikidata'] === WAFFLE_WIKIDATA) return true;
  return tags.brand === 'Waffle House' || tags.name === 'Waffle House';
}

// Overpass returns the three sets in one flat `elements` list, in query
// order. Membership is decided by tags, not by position, because a way can
// in principle match more than one statement.
function parse(json) {
  var out = { wafflehouses: [], places: [], roads: [] };
  var seen = {};
  ((json && json.elements) || []).forEach(function (el) {
    var id = el.type + '/' + el.id;
    var tags = el.tags || {};
    if (el.type === 'way' && el.geometry && /^(motorway|trunk)$/.test(tags.highway || '')) {
      if (seen['road:' + id]) return;
      seen['road:' + id] = 1;
      out.roads.push({
        id: id, highway: tags.highway, ref: tags.ref || '',
        line: el.geometry.map(function (g) { return { lat: g.lat, lon: g.lon }; })
      });
      return;
    }
    var p = pointOf(el);
    if (!p) return;
    if (isWaffleHouse(tags)) {
      if (seen['wh:' + id]) return;
      seen['wh:' + id] = 1;
      out.wafflehouses.push({ id: id, lat: p.lat, lon: p.lon, tags: tags });
      return;
    }
    if (tags.amenity === 'fuel' || tags.highway === 'services' || tags.amenity === 'parking') {
      if (seen['pl:' + id]) return;
      seen['pl:' + id] = 1;
      out.places.push({ id: id, lat: p.lat, lon: p.lon, tags: tags });
    }
  });
  return out;
}

module.exports = { overpassQuery, waffleOnlyQuery, tileQuery, tilesFor, parse, isWaffleHouse, pointOf, AROUND_M, WAFFLE_WIKIDATA };
