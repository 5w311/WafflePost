// Remeasures every surviving atlas distance from a geocoded truck stop
// address, and regenerates data/atlas.csv from DATA so the CSV cannot drift.
//
// Why this exists: the 09-2026 re-audit found that neither verification pass
// had re-measured the distances, and that in every row that failed the audit
// the sub-thousand-foot figure was fabricated. So every surviving feet value
// is of unknown provenance until this script has either confirmed it or
// flagged it. The walk strip, the tier bands, the sort order and the app's
// headline claim all rest on these numbers.
//
// Standalone node only. Never loaded by index.html. Uses the app's own
// lib/waffledist haversine rather than reimplementing it, so the number the
// script derives is computed by the same code that will display it.
//
// What it does per row:
//   - geocode the truck stop (tsAddr when the re-audit produced one, else
//     the operator name) through HERE Geocoding v7, scoped to city+state
//   - haversine from the geocoded point to the row's Waffle House coordinate
//   - |new - old| <= 50 ft            -> CONFIRMED, applied
//   - |new - old|  > 50 ft            -> NEEDS DECISION, applied only when
//                                        named in --accept "City|exit,..."
//   - recomputes past WALKABLE_FT     -> BAND EXIT, never auto-applied.
//                                        Bishopville earned honorary status
//                                        on driver evidence, not arithmetic;
//                                        nothing gets demoted there quietly.
//   - geocode unresolved/not credible -> feet untouched, labelled stale in
//                                        the report. A stale number that is
//                                        labelled stale is recoverable; an
//                                        invented one is not.
//
// Always writes scripts/remeasure-report.txt (committed, every judgment
// call) and regenerates data/atlas.csv. Applies accepted feet back into
// index.html's DATA and re-sorts it shortest-walk-first.

var fs = require('fs');
var path = require('path');
var https = require('https');
var wd = require('../lib/waffledist');

var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var REPORT = path.join(__dirname, 'remeasure-report.txt');
var CSV = path.join(ROOT, 'data', 'atlas.csv');

var TOLERANCE_FT = 50;
// A geocode landing further than this from the Waffle House is not this
// exit's truck stop at all - it is the adjacent-exit failure mode this
// re-audit exists to catch - so it is reported as unresolved, not applied.
var CREDIBLE_MI = 6;

var accept = {};
var acceptBand = false;
process.argv.slice(2).forEach(function (a, i, all) {
  if (a === '--accept' && all[i + 1]) {
    all[i + 1].split(',').forEach(function (k) { accept[k.trim()] = true; });
  }
  if (a === '--accept-band') acceptBand = true;
});

var src = fs.readFileSync(INDEX, 'utf8');
var key = (src.match(/var HERE_API_KEY = '([^']*)'/) || [])[1];
if (!key) { console.error('no HERE_API_KEY in index.html'); process.exit(1); }

var dataMatch = src.match(/(var DATA = \[\n)([\s\S]*?)(\n\];)/);
var lines = dataMatch[2].split('\n');
var DATA = eval('[' + dataMatch[2] + ']');
if (DATA.length !== lines.length) {
  console.error('DATA rows and source lines disagree - a row is not one line');
  process.exit(1);
}

function get(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    }).on('error', reject);
  });
}

async function geocode(q, state) {
  var url = 'https://geocode.search.hereapi.com/v1/geocode?q=' +
    encodeURIComponent(q) + '&in=countryCode:USA&limit=3&apiKey=' + key;
  var r = null;
  // A domain-restriction lift propagates unevenly across HERE's edges - one
  // request can get 200 and the next 401 for a minute or two. Retry auth
  // failures with backoff before concluding the key is genuinely locked.
  for (var a = 0; a < 6; a++) {
    r = await get(url);
    if (r.status !== 401 && r.status !== 403) break;
    await pause(3000 * (a + 1));
  }
  return Promise.resolve(r).then(function (r) {
    if (r.status === 401 || r.status === 403) {
      throw new Error('HERE rejected the key (' + r.status + ') persistently. ' +
        'The key is domain-locked; this script has no Referer to give it. ' +
        'Lift the restriction for the run, then put it back.');
    }
    if (r.status !== 200) return null;
    var items = (JSON.parse(r.body).items || []);
    // Only results that name a POINT can measure a walk. houseNumber is an
    // address; place is a POI. street and intersection are line centroids -
    // the first run scored Milton at 15,792 ft off the centroid of Garcon
    // Point Rd, which is not a measurement of anything.
    var GOOD = { houseNumber: 1, place: 1 };
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!GOOD[it.resultType]) continue;
      if (((it.address || {}).stateCode || '') !== state) continue;
      return { lat: it.position.lat, lon: it.position.lng,
               title: it.title, type: it.resultType };
    }
    return null;
  });
}

// A place-type hit is a NAME match, and the name must actually be the
// operator's. The first run matched "CAT SCALE" for a TA and "Gulf" for JP
// Truck Stop - same city, wrong business, plausible-looking distance.
function titleMatches(title, ts) {
  var norm = function (x) {
    return String(x).toLowerCase().replace(/#\d+/g, '').replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\b(travel|center|centre|centers|stopping|truck|stop|plaza|auto|express)\b/g, '')
      .replace(/\s+/g, ' ').trim();
  };
  var a = norm(title), b = norm(ts);
  if (!a || !b) return false;
  // Space-blind containment too: HERE writes "ONE 9" where the atlas writes
  // "ONE9", and that is the same operator, not a miss.
  var aa = a.replace(/ /g, ''), bb = b.replace(/ /g, '');
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1 ||
    aa.indexOf(bb) !== -1 || bb.indexOf(aa) !== -1 ||
    a.split(' ')[0] === b.split(' ')[0];
}

function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function csvField(v) {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function writeCsv(rows) {
  var out = ['feet,corridor,state,exit,city,truck_stop,lat,lon,waffle_house_address,truck_stop_address'];
  rows.forEach(function (r) {
    out.push([r.feet, r.corridor, r.state, r.exit, r.city, r.ts, r.lat, r.lon,
              r.addr || '', r.tsAddr || ''].map(csvField).join(','));
  });
  fs.writeFileSync(CSV, out.join('\n') + '\n');
}

(async function () {
  var report = [];
  var counts = { confirmed: 0, applied: 0, decision: 0, band: 0, stale: 0, altStale: 0 };
  var updates = {};   // line index -> new feet

  report.push('WAFFLEPOST REMEASURE - ' + DATA.length + ' rows');
  report.push('tolerance ' + TOLERANCE_FT + ' ft; walkable line ' + wd.WALKABLE_FT + ' ft');
  report.push('');

  for (var i = 0; i < DATA.length; i++) {
    var r = DATA[i];
    var id = r.city + '|' + r.exit;
    var q = r.tsAddr
      ? (/^\d/.test(r.tsAddr) ? r.tsAddr : r.ts + ', ' + r.tsAddr) + ', ' + r.city + ', ' + r.state
      : r.ts + ', ' + r.city + ', ' + r.state;
    var hit = await geocode(q, r.state);
    await pause(150);

    if (!hit) {
      counts.stale++;
      report.push('STALE      ' + id + '  feet ' + r.feet + ' kept - geocode could not resolve "' + q + '"');
      continue;
    }
    if (hit.type === 'place' && !titleMatches(hit.title, r.ts)) {
      counts.stale++;
      report.push('STALE      ' + id + '  feet ' + r.feet + ' kept - geocode matched "' + hit.title +
        '", which is not ' + r.ts + '; a name miss is not a measurement');
      continue;
    }
    var mi = wd.haversine({ lat: hit.lat, lon: hit.lon }, { lat: r.lat, lon: r.lon });
    var newFeet = Math.round(mi * 5280);
    var diff = newFeet - r.feet;

    if (mi > CREDIBLE_MI) {
      counts.stale++;
      report.push('STALE      ' + id + '  feet ' + r.feet + ' kept - geocode "' + hit.title +
        '" is ' + mi.toFixed(1) + ' mi from the Waffle House; wrong place, not a measurement');
      continue;
    }
    // A bare name match landing outside the walkable band contradicts two
    // human verification passes that said this pairing is real. The humans
    // looked at satellite; the geocoder looked up a name. When they disagree
    // by that much, the geocoder found a same-name store somewhere else, and
    // the row keeps its figure, labelled, for a field follow-up. Only an
    // ADDRESS-level hit is allowed to indict a row (the BAND EXIT below).
    if (hit.type === 'place' && newFeet > wd.WALKABLE_FT && r.feet <= wd.WALKABLE_FT) {
      counts.stale++;
      report.push('STALE      ' + id + '  feet ' + r.feet + ' kept - name-match "' + hit.title +
        '" lands at ' + newFeet + ' ft, past the walkable line; the verified pairing outranks a name match. Field follow-up.');
      continue;
    }
    if (Math.abs(diff) <= TOLERANCE_FT) {
      counts.confirmed++;
      updates[i] = newFeet;
      report.push('CONFIRMED  ' + id + '  ' + r.feet + ' -> ' + newFeet + ' ft (' +
        (diff >= 0 ? '+' : '') + diff + ')  via "' + hit.title + '" [' + hit.type + ']');
      continue;
    }
    if (newFeet > wd.WALKABLE_FT && r.feet <= wd.WALKABLE_FT) {
      counts.band++;
      report.push('BAND EXIT  ' + id + '  ' + r.feet + ' -> ' + newFeet +
        ' ft LEAVES THE WALKABLE BAND  via "' + hit.title + '" [' + hit.type + ']' +
        (acceptBand && accept[id] ? '  ACCEPTED BY --accept-band' : '  NOT APPLIED - human decision required'));
      if (acceptBand && accept[id]) { updates[i] = newFeet; counts.applied++; }
      continue;
    }
    if (accept[id]) {
      counts.applied++;
      updates[i] = newFeet;
      report.push('APPLIED    ' + id + '  ' + r.feet + ' -> ' + newFeet + ' ft (' +
        (diff >= 0 ? '+' : '') + diff + ')  accepted by decision  via "' + hit.title + '" [' + hit.type + ']');
    } else {
      counts.decision++;
      report.push('DECISION   ' + id + '  shipped ' + r.feet + ' ft, remeasured ' + newFeet +
        ' ft (' + (diff >= 0 ? '+' : '') + diff + ')  via "' + hit.title + '" [' + hit.type +
        ']  - rerun with --accept "' + id + '" to take the remeasured figure');
    }
  }

  // Alternates: only the ones the re-audit gave an address. The rest keep
  // their shipped figure, named here so stale is labelled, never implied.
  report.push('');
  for (var j = 0; j < DATA.length; j++) {
    (DATA[j].alt || []).forEach(function (a) {
      if (!a.tsAddr) {
        counts.altStale++;
        report.push('ALT STALE  ' + DATA[j].city + '|' + DATA[j].exit + ' alt "' + a.ts +
          '"  feet ' + a.feet + ' kept - no address yet; remeasure when one lands');
      }
    });
  }
  var altAddrs = [];
  DATA.forEach(function (r, idx) {
    (r.alt || []).forEach(function (a) { if (a.tsAddr) altAddrs.push({ row: r, idx: idx, alt: a }); });
  });
  for (var k = 0; k < altAddrs.length; k++) {
    var e = altAddrs[k];
    var hq = (/^\d/.test(e.alt.tsAddr) ? e.alt.tsAddr : e.alt.ts + ', ' + e.alt.tsAddr) +
      ', ' + e.row.city + ', ' + e.row.state;
    var ahit = await geocode(hq, e.row.state);
    await pause(150);
    var aid = e.row.city + '|' + e.row.exit + ' alt ' + e.alt.ts;
    if (!ahit) { report.push('ALT STALE  ' + aid + '  feet ' + e.alt.feet + ' kept - unresolved'); counts.altStale++; continue; }
    var ami = wd.haversine({ lat: ahit.lat, lon: ahit.lon }, { lat: e.row.lat, lon: e.row.lon });
    var anew = Math.round(ami * 5280);
    var adiff = anew - e.alt.feet;
    if (ami > CREDIBLE_MI) { report.push('ALT STALE  ' + aid + '  kept - geocode ' + ami.toFixed(1) + ' mi off'); counts.altStale++; continue; }
    if (Math.abs(adiff) <= TOLERANCE_FT || accept[e.row.city + '|' + e.row.exit]) {
      var line = lines[e.idx];
      var pat = new RegExp("(\\{ts:(?:'|\")" + e.alt.ts.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'|\"),feet:)" + e.alt.feet + '\\b');
      if (pat.test(line)) {
        lines[e.idx] = line.replace(pat, '$1' + anew);
        report.push((Math.abs(adiff) <= TOLERANCE_FT ? 'ALT CONF   ' : 'ALT APPLY  ') + aid + '  ' +
          e.alt.feet + ' -> ' + anew + ' ft (' + (adiff >= 0 ? '+' : '') + adiff + ')  via "' + ahit.title + '"');
      }
    } else {
      counts.decision++;
      report.push('DECISION   ' + aid + '  shipped ' + e.alt.feet + ' ft, remeasured ' + anew +
        ' ft (' + (adiff >= 0 ? '+' : '') + adiff + ')  - rerun with --accept "' + e.row.city + '|' + e.row.exit + '"');
    }
  }

  // Apply primary feet updates to the row lines, then re-sort shortest-first.
  Object.keys(updates).forEach(function (ix) {
    var i2 = +ix;
    var pat = new RegExp('^(\\{feet:)' + DATA[i2].feet + '\\b');
    if (!pat.test(lines[i2])) { console.error('could not apply feet to row ' + i2); process.exit(1); }
    lines[i2] = lines[i2].replace(pat, '$1' + updates[i2]);
    DATA[i2].feet = updates[i2];
  });
  var order = lines.map(function (l, i3) { return { l: l, f: +(l.match(/^\{feet:(\d+)/) || [])[1], i: i3 }; });
  order.sort(function (a, b) { return a.f - b.f || a.i - b.i; });
  // The final row of a JS array literal has no trailing comma, and sorting
  // can move it anywhere. Split each line into code and trailing comment,
  // normalise the comma onto every row but the new last, and reattach.
  var newBody = order.map(function (o, i4) {
    var cut = o.l.indexOf('  //');
    var code = (cut < 0 ? o.l : o.l.slice(0, cut)).replace(/\s+$/, '');
    var cmt = cut < 0 ? '' : o.l.slice(cut);
    if (code.slice(-1) === ',') code = code.slice(0, -1);
    return code + (i4 < order.length - 1 ? ',' : '') + cmt;
  }).join('\n');
  fs.writeFileSync(INDEX, src.slice(0, dataMatch.index) + dataMatch[1] + newBody + dataMatch[3] +
    src.slice(dataMatch.index + dataMatch[0].length));

  // CSV regenerated from DATA, in the new order - never hand-edited again.
  var sortedData = order.map(function (o) { return DATA[o.i]; });
  writeCsv(sortedData);

  report.push('');
  report.push('COUNTS  confirmed(<=' + TOLERANCE_FT + 'ft) ' + counts.confirmed +
    '  applied-by-decision ' + counts.applied + '  needs-decision ' + counts.decision +
    '  band-exit ' + counts.band + '  stale ' + counts.stale + '  alt-stale ' + counts.altStale);
  fs.writeFileSync(REPORT, report.join('\n') + '\n');
  console.log(report.join('\n'));
})().catch(function (e) { console.error(e.message); process.exit(1); });
