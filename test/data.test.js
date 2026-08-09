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

var OK_FLAGS = ['free','scale','diner','limited','caution'];
var seen = {}, honorary = 0, pairings = 0;

t.eq(DATA.length > 0, true, 'DATA parsed out of index.html');

DATA.forEach(function(r){
  var id = r.city + '|' + r.corridor + '|' + r.exit;
  t.eq(seen[id], undefined, 'no duplicate exit: ' + id);
  seen[id] = 1;

  t.eq(typeof r.feet === 'number' && r.feet > 0, true, r.city + ' has real feet');
  t.eq(/^I-\d+$/.test(r.corridor), true, r.city + ' corridor looks like an interstate');
  t.eq(/^[A-Z]{2}$/.test(r.state), true, r.city + ' has a two-letter state');
  t.eq(!!BRAND[r.brand], true, r.city + ' brand "' + r.brand + '" is in BRAND');

  // Continental US bounding box - catches a transposed or sign-flipped pair,
  // which is the coordinate error that would otherwise look plausible.
  t.eq(r.lat > 24 && r.lat < 50, true, r.city + ' latitude is inside CONUS');
  t.eq(r.lon > -125 && r.lon < -66, true, r.city + ' longitude is inside CONUS');

  (r.flags || []).forEach(function(f){
    t.eq(OK_FLAGS.indexOf(f) !== -1, true, r.city + ' flag "' + f + '" is a known flag');
  });

  pairings++;
  (r.alt || []).forEach(function(a){
    pairings++;
    t.eq(a.feet >= r.feet, true, r.city + ': the primary stop is the closest one');
    t.eq(!!BRAND[a.brand], true, r.city + ' alternate brand is in BRAND');
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

console.log('     ' + DATA.length + ' exits, ' + pairings + ' pairings, ' +
            honorary + ' honorary');
t.done('data');
