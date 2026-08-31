// Parses the live DATA array and BRAND map out of index.html rather than
// keeping a second copy here. A fixture would drift; this fails loudly the
// moment a real row goes in wrong.
var t = require('./_assert'), fs = require('fs'), path = require('path');
var wd = require('../lib/waffledist');

var src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function grab(name){
  var m = src.match(new RegExp('^var ' + name + ' = (\\[[\\s\\S]*?\\n\\];|\\{[\\s\\S]*?\\n\\};)', 'm'));
  if (!m) throw new Error('could not find ' + name + ' in index.html');
  return eval('(' + m[1].replace(/;$/, '') + ')');
}
var DATA = grab('DATA'), BRAND = grab('BRAND');

var OK_FLAGS = ['free','scale','diner','limited','caution','smalllot'];
var seen = {}, seenAddr = {}, honorary = 0, pairings = 0;
// truck stop / truckstop / unknown / tbd / empty, case-insensitive.
var PLACEHOLDER = /^\s*(truck\s*stop|unknown|tbd)?\s*$/i;

t.eq(DATA.length > 0, true, 'DATA parsed out of index.html');

DATA.forEach(function(r){
  var id = r.city + '|' + r.corridor + '|' + r.exit;
  t.eq(seen[id], undefined, 'no duplicate exit: ' + id);
  seen[id] = 1;

  t.eq(typeof r.feet === 'number' && r.feet > 0, true, r.city + ' has real feet');

  // THE GUARD THAT WOULD HAVE CAUGHT THE 09-2026 PURGE TEN ROWS EARLY.
  // Twenty-one rows shipped with the literal placeholder "Truck stop" as the
  // operator name, and every shape check in this file stayed green for the
  // entire life of the bad data - a placeholder passes them all. An operator
  // name is a claim about the world; a placeholder is an admission nobody
  // checked, and it must never ship as fact again.
  t.eq(PLACEHOLDER.test(r.ts), false, r.city + ' names a real operator, not "' + r.ts + '"');
  t.eq(/^I-\d+$/.test(r.corridor), true, r.city + ' corridor looks like an interstate');
  t.eq(/^[A-Z]{2}$/.test(r.state), true, r.city + ' has a two-letter state');
  t.eq(!!BRAND[r.brand], true, r.city + ' brand "' + r.brand + '" is in BRAND');

  // Continental US bounding box - catches a transposed or sign-flipped pair,
  // which is the coordinate error that would otherwise look plausible.
  t.eq(r.lat > 24 && r.lat < 50, true, r.city + ' latitude is inside CONUS');
  t.eq(r.lon > -125 && r.lon < -66, true, r.city + ' longitude is inside CONUS');

  // The address describes the SAME point as lat/lon - the Waffle House, not
  // the truck stop - and is what the stop sheet and share text now print
  // instead of the coordinate pair. Coordinates stay because they draw the
  // pin, project the row onto a route, and are what `feet` was measured
  // between; the address is the human-readable face of the same point.
  t.eq(typeof r.addr === 'string' && r.addr.length > 8, true,
       r.city + ' has a street address');
  // Starts with a house number: the generator strips leading business names,
  // and a bare POI name ("Blink Charging") slipping through means a bad row.
  t.eq(/^\d/.test(r.addr), true, r.city + ' address starts with a house number');
  // The state in the address must match the row's own state. This is the
  // check that catches an address reverse-geocoded onto the wrong side of a
  // state line, which is otherwise entirely plausible-looking.
  t.eq(new RegExp(',\\s*' + r.state + '\\s+\\d{5}').test(r.addr), true,
       r.city + ' address is in ' + r.state + ': ' + r.addr);
  // And no two rows may share one - two Waffle Houses do not have the same
  // door, so a duplicate means a copy-paste row or a geocode that landed on
  // the wrong store.
  t.eq(seenAddr[r.addr], undefined, r.city + ' address is not another row\'s: ' + r.addr);
  seenAddr[r.addr] = 1;

  (r.flags || []).forEach(function(f){
    t.eq(OK_FLAGS.indexOf(f) !== -1, true, r.city + ' flag "' + f + '" is a known flag');
  });

  pairings++;
  (r.alt || []).forEach(function(a){
    pairings++;
    t.eq(a.feet >= r.feet, true, r.city + ': the primary stop is the closest one');
    t.eq(!!BRAND[a.brand], true, r.city + ' alternate brand is in BRAND');
    t.eq(PLACEHOLDER.test(a.ts), false, r.city + ' alt names a real operator, not "' + a.ts + '"');
  });

  if (r.feet > wd.WALKABLE_FT) {
    honorary++;
    t.eq((r.flags || []).length > 0 || !!r.note, true,
         r.city + ' is past the walkable line, so it must carry its evidence');
  }
});

t.eq(honorary, 1, 'exactly one honorary member (Bishopville)');

var sorted = DATA.map(function(r){ return r.feet; });
t.eq(sorted.slice().sort(function(a,b){return a-b;}).join() === sorted.join(), true,
     'DATA is stored shortest-walk-first, so the file reads as the leaderboard');

t.eq(DATA[0].city, 'Good Hope', 'Good Hope AL still holds the record');
t.eq(DATA[0].feet, 170, 'at 170 ft');

// ---- the truck stop's own address (v4.15.0) ----
// The card used to show only the Waffle House's address, which is the wrong
// half for a driver deciding where to park. What is pinned here is the SHAPE
// and the EXCEPTIONS, because the addresses themselves are verified in
// scripts/tsaddr-report.txt and cannot be re-derived from inside a test.
var noTsAddr = DATA.filter(function (r) { return !r.tsAddr; })
                   .map(function (r) { return r.city + '|' + r.exit; }).sort();
// Pinned as an exact set, not a count. These three are a reasoned exception:
// each produced a well-sourced address that contradicts its own row, so the
// row needs auditing before an address is attached to it. A fourth row losing
// its address should fail here and be argued for, not absorbed into a number.
t.eq(noTsAddr.join(', '), 'DeFuniak Springs|70, Orange|877, Winnie|829',
     'exactly the three rows whose address contradicts their own data have none');
DATA.forEach(function (r) {
  if (!r.tsAddr) return;
  t.eq(typeof r.tsAddr === 'string' && r.tsAddr.length > 5, true,
       r.city + ' truck stop address is a real string');
  // Street line only. The stop sheet's heading already carries city, state
  // and exit; a full address here would repeat them on every card, and the
  // share text labels the two lines rather than qualifying them.
  t.eq(new RegExp(',\\s*' + r.state + '\\s+\\d{5}').test(r.tsAddr), false,
       r.city + ' truck stop address is a street line, not a full address');
  // A truck stop is not the Waffle House. If these ever match, something has
  // copied one field into the other.
  t.eq(r.tsAddr === r.addr, false,
       r.city + ' truck stop address is not the Waffle House address');
});
// Alternate stops follow the same rule where they carry one.
DATA.forEach(function (r) {
  (r.alt || []).forEach(function (a) {
    if (!a.tsAddr) return;
    t.eq(typeof a.tsAddr === 'string' && a.tsAddr.length > 5, true,
         r.city + ' alt ' + a.ts + ' address is a real string');
    t.eq(a.tsAddr === r.tsAddr, false,
         r.city + ' alt ' + a.ts + ' has its own address, not the primary stop\'s');
  });
});

// data/atlas.csv is regenerated from DATA by scripts/remeasure.js, never
// hand-edited. This pins the two against each other row for row, so the CSV
// cannot drift the way a hand-maintained second copy always eventually does.
function parseCsv(text){
  var rows = [], row = [], field = '', q = false;
  for (var i = 0; i < text.length; i++){
    var c = text[i];
    if (q){
      if (c === '"' && text[i+1] === '"'){ field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ','){ row.push(field); field = ''; }
    else if (c === '\n'){ row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 1) { row.push(field); rows.push(row); }
  return rows;
}
var csv = parseCsv(fs.readFileSync(path.join(__dirname, '..', 'data', 'atlas.csv'), 'utf8'));
var hdr = csv.shift();
t.eq(hdr.slice(0,6).join(','), 'feet,corridor,state,exit,city,truck_stop',
     'atlas.csv leads with the six identity columns');
t.eq(csv.length, DATA.length, 'atlas.csv holds exactly one line per DATA row');
DATA.forEach(function(r, i){
  var c = csv[i] || [];
  t.eq(+c[0] === r.feet && c[1] === r.corridor && c[2] === r.state &&
       c[3] === r.exit && c[4] === r.city && c[5] === r.ts, true,
       'atlas.csv row ' + i + ' matches DATA: ' + r.city + ' x' + r.exit);
});

console.log('     ' + DATA.length + ' exits, ' + pairings + ' pairings, ' +
            honorary + ' honorary');
t.done('data');
