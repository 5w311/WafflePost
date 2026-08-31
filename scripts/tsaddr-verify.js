// Verifies every truck stop address this atlas ships, against HERE, two ways.
//
//   node scripts/tsaddr-verify.js
//
// WHY THIS EXISTS AND WHAT IT IS NOT. The street lines were established by a
// three-source audit (see tsaddr-report.txt) and the localities by geocoding
// each line on its own. Neither of those is re-runnable from a unit test: they
// need the network, and test/run.js is offline and dependency-free on purpose.
// So the unit suite pins the SHAPE - house number, city, matching state, ZIP -
// and this script checks the CLAIM: that each address names a real building,
// in the right place, in the town it says.
//
// Two independent directions, because one is not enough:
//
//   FORWARD  geocode the stored string. It must resolve at house-number
//            precision, land within TOL_FT of the distance the row's `feet`
//            claims, and echo back the same city, state and ZIP that is stored.
//   REVERSE  reverse-geocode the position that came back. HERE then names the
//            locality from coordinates alone, having never been shown the city
//            we asked about. A postal city that only exists because we supplied
//            it in the query dies here; a forward check alone cannot see it.
//
// Every row carries an address as of v4.17.0. A row LOSING one is caught by
// test/data.test.js, which requires all of them; this script never treats a
// missing address as acceptable.
//
// Standalone node only, never loaded by index.html. Uses the app's own
// haversine so the distance this checks is computed by the code that ships.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var wd = require('../lib/waffledist');

var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var TOL_FT = 500;          // a truck stop lot is bigger than a rooftop pin
var FT_PER_MI = 5280;

// THREE ROWS WHERE THE GEOCODER IS THE UNRELIABLE ONE, not the address.
//
// The distance gate is a proxy for "does this address name the right
// building". At these three parcels HERE's house-number index cannot answer
// that - it puts a correct, operator-published address 674 to 3,043 ft from
// where the business demonstrably is. Loosening TOL_FT for all seventy to
// accommodate three would blind the check everywhere it works. So they are
// named here, with what stands in for the gate, and the reason is on the
// record rather than in a commit message.
//
// They are NOT unchecked. Each still has to pass the city, state and ZIP
// agreement, forward and reverse; and in place of geocoding the address, a
// POI for the operator must sit within TOL_FT of the distance the row claims
// - which tests the same thing (right building, right place) through the one
// index that has these parcels right. See scripts/tsaddr-report.txt.
var GEOCODE_EXEMPT = {
  'Orange|877': 'HERE puts 2205 Highway 62 S 926 ft out against an audited 252 ft. ' +
    'Pilot #431 is identified in OSM by phone AND fax matching its published contact, ' +
    'and the neighbours run 2302 Burger King, 2310 Waffle House, 2311 McDonald\'s, ' +
    '2321 Comfort Inn - 2205 south of them is consistent and unclaimed.',
  'Winnie|829': 'HERE geocodes 45950 Interstate 10 to a point 3,379 ft away - a bad geocode ' +
    'of a correct postal address. Texas TABC licenses exactly one business at that number, ' +
    'CAT Scale locator #2720 gives it with a phone that matches every JP directory listing, ' +
    'and its surveyed scale node sits 205 ft from the Waffle House.',
  'DeFuniak Springs|70': "HERE snaps 17750 to a different house number, 17800. Love's own " +
    'page publishes the city as Mossy Head FL 32435, an invalid pairing - Mossy Head is ' +
    '32434 and PO-Box only - which is what threw the geocode two miles. McDonald\'s, a ' +
    'tenant inside the building, publishes the DeFuniak Springs form verbatim.',
};

var src = fs.readFileSync(INDEX, 'utf8');
var KEY = (src.match(/var HERE_API_KEY = '([^']+)'/) || [])[1];
var DATA = (function () {
  var m = src.match(/var DATA = \[[\s\S]*?\n\];/);
  var ctx = {}; vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.D = DATA;', ctx);
  return ctx.D;
})();

function feetBetween(a, b) { return wd.haversine(a, b) * FT_PER_MI; }
function norm(s) { return String(s || '').toLowerCase().replace(/[.'']/g, '').replace(/\s+/g, ' ').trim(); }
function zip5(s) { return String(s || '').split('-')[0]; }

// "1639 County Road 437, Cullman, AL 35055"
function parts(full) {
  var m = String(full).match(/^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})$/);
  return m ? { street: m[1], city: m[2], state: m[3], zip: m[4] } : null;
}

async function here(url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function forward(full, row) {
  var u = 'https://geocode.search.hereapi.com/v1/geocode?q=' + encodeURIComponent(full) +
    '&at=' + row.lat + ',' + row.lon + '&in=countryCode:USA&limit=3&apiKey=' + KEY;
  var items = (await here(u)).items || [];
  var it = items.filter(function (i) { return i.resultType === 'houseNumber' && i.position; })[0];
  if (!it) return { none: true, got: items[0] ? items[0].resultType : 'nothing' };
  var a = it.address;
  return { city: a.city, state: a.stateCode, zip: zip5(a.postalCode),
           lat: it.position.lat, lon: it.position.lng, label: a.label,
           ft: Math.round(feetBetween({ lat: row.lat, lon: row.lon },
                                      { lat: it.position.lat, lon: it.position.lng })) };
}
async function reverse(lat, lon) {
  var u = 'https://revgeocode.search.hereapi.com/v1/revgeocode?at=' + lat + ',' + lon +
    '&types=address&limit=1&apiKey=' + KEY;
  var items = (await here(u)).items || [];
  if (!items[0]) return null;
  var a = items[0].address;
  return { city: a.city, state: a.stateCode, zip: zip5(a.postalCode) };
}

(async function () {
  if (!KEY) { console.error('no HERE_API_KEY in index.html'); process.exit(1); }

  // Rows and alternate stops alike. An alt is judged against its OWN feet -
  // judging one against the primary's flagged both Oak Grove alts as a
  // thousand feet wrong when each sits exactly where it should.
  var jobs = [];
  DATA.forEach(function (r) {
    if (r.tsAddr) jobs.push({ row: r, what: r.ts, full: r.tsAddr, feet: r.feet });
    (r.alt || []).forEach(function (a) {
      if (a.tsAddr) jobs.push({ row: r, what: r.ts + ' / also ' + a.ts, full: a.tsAddr, feet: a.feet });
    });
  });

  var bad = [], exemptOk = [];
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i], id = j.row.city + '|' + j.row.exit;
    var p = parts(j.full), issues = [];
    if (!p) {
      issues.push('does not parse as "street, City, ST NNNNN"');
    } else {
      if (!/^\d+\s+\S/.test(p.street)) issues.push('street line has no house number');
      if (p.state !== j.row.state) issues.push('state ' + p.state + ' is not the row\'s ' + j.row.state);
      var exempt = GEOCODE_EXEMPT[id];
      var f;
      try { f = await forward(j.full, j.row); } catch (e) { issues.push('geocode failed: ' + e.message); }
      if (f && f.none) issues.push('no house-number match (got ' + f.got + ')');
      else if (f) {
        if (Math.abs(f.ft - j.feet) > TOL_FT && !exempt)
          issues.push('lands ' + f.ft + ' ft from the Waffle House; feet says ' + j.feet);
        if (f.state !== p.state) issues.push('forward state ' + f.state + ' != stored ' + p.state);
        if (norm(f.city) !== norm(p.city)) issues.push('forward city "' + f.city + '" != stored "' + p.city + '"');
        if (f.zip && f.zip !== p.zip) issues.push('forward ZIP ' + f.zip + ' != stored ' + p.zip);
        var rv = null;
        try { rv = await reverse(f.lat, f.lon); } catch (e) { }
        if (!rv) issues.push('reverse geocode returned nothing');
        else {
          if (rv.state !== p.state) issues.push('reverse state ' + rv.state + ' != stored ' + p.state);
          if (norm(rv.city) !== norm(p.city)) issues.push('reverse city "' + rv.city + '" != stored "' + p.city + '"');
          if (rv.zip && rv.zip !== p.zip) issues.push('reverse ZIP ' + rv.zip + ' != stored ' + p.zip);
        }
      }
    }
    // The substitute gate for an exempt row: a POI for this operator must sit
    // where the row says the truck stop is. If that fails too, nothing is
    // vouching for the building any more and the exemption stops applying.
    if (GEOCODE_EXEMPT[id]) {
      var poiFt = null;
      try {
        var du = 'https://discover.search.hereapi.com/v1/discover?in=circle:' + j.row.lat + ',' +
          j.row.lon + ';r=1500&q=' + encodeURIComponent(j.row.ts) + '&limit=10&apiKey=' + KEY;
        var cands = ((await here(du)).items || []).filter(function (i) { return i.position; })
          .map(function (i) {
            return Math.round(feetBetween({ lat: j.row.lat, lon: j.row.lon },
                                          { lat: i.position.lat, lon: i.position.lng }));
          }).sort(function (a, b) { return Math.abs(a - j.feet) - Math.abs(b - j.feet); });
        poiFt = cands.length ? cands[0] : null;
      } catch (e) { }
      if (poiFt == null) issues.push('exempt from the geocode gate, but no operator POI found to stand in for it');
      else if (Math.abs(poiFt - j.feet) > TOL_FT)
        issues.push('exempt from the geocode gate, and the nearest ' + j.row.ts +
                    ' POI is ' + poiFt + ' ft out against an audited ' + j.feet);
      else exemptOk.push(id + '  (POI at ' + poiFt + ' ft vs audited ' + j.feet + ' ft)');
    }
    if (issues.length) { bad.push({ id: id, what: j.what, full: j.full, issues: issues }); }
    process.stdout.write((issues.length ? 'x' : (GEOCODE_EXEMPT[id] ? '=' : '.')));
  }
  process.stdout.write('\n\n');

  var none = DATA.filter(function (r) { return !r.tsAddr; });
  if (none.length) {
    console.log('FAIL - these rows carry no truck stop address at all:');
    none.forEach(function (r) { console.log('  ' + r.city + '|' + r.exit + '  ' + r.ts); });
    process.exit(1);
  }
  if (exemptOk.length) {
    console.log('= exempt from the geocode distance gate, vouched for by an operator POI instead:');
    exemptOk.forEach(function (m) { console.log('    ' + m); });
    console.log('');
  }
  console.log('checked ' + jobs.length + ' addresses across ' + DATA.length + ' rows');
  if (bad.length) {
    console.log('\nFAIL - ' + bad.length + ' address(es) do not verify\n');
    bad.forEach(function (b) {
      console.log('  ' + b.id + '  ' + b.what);
      console.log('    ' + b.full);
      b.issues.forEach(function (m) { console.log('      - ' + m); });
    });
    process.exit(1);
  }
  console.log('all verify: house-number precision, right distance, and the city');
  console.log('agreed by forward AND reverse geocoding');
})().catch(function (e) { console.error(e.stack || e.message); process.exit(1); });
