var t = require('./_assert'), tt = require('../lib/triptext');

var row = { feet:205, corridor:'I-55', state:'LA', exit:'28', city:'Hammond', ts:'Pilot',
            lat:30.47809, lon:-90.45646, note:'Invisible to every exit guide.',
            alt:[{ts:'Petro (Iron Skillet)', feet:659}] };

var st = tt.formatStopText(row, 'Rev 08-2026');
t.eq(st.indexOf('Hammond, LA  I-55 exit 28') !== -1, true, 'stop text names the exit');
t.eq(st.indexOf('205 ft (1 min walk)') !== -1, true, '205 ft rounds to a one minute walk');
// The sub-minute branch needs its own case: 170 ft is the only walk on the
// whole atlas short enough to reach it, and "0.5 min" would read as a joke.
var gh = tt.formatStopText({feet:170, corridor:'I-65', state:'AL', exit:'304',
  city:'Good Hope', ts:"Jack's Truck Stop", lat:34.11486, lon:-86.86387, note:''}, 'r');
t.eq(gh.indexOf('170 ft (under a minute walk)') !== -1, true,
     'the shortest walk in America reads as words, not as a decimal minute');
t.eq(st.indexOf('also: Petro (Iron Skillet) - 659 ft') !== -1, true, 'the second stop is carried');
t.eq(st.indexOf('! Invisible') !== -1, true, 'and the note');
t.eq(st.indexOf('30.47809, -90.45646') !== -1, true, 'coordinates survive for a nav app');

var plan = { from:'Orlando, FL', to:'Dallas, TX', miles:1103.4, profile:'Standard rig',
             tierUsed:1, stops:[{row:row, routeMile:412.7, detourMi:0.34}] };
var rt = tt.formatRouteText(plan, 'Rev 08-2026');
t.eq(rt.indexOf('Orlando, FL  ->  Dallas, TX') !== -1, true, 'route text names both ends');
t.eq(rt.indexOf('1,103 mi  |  Standard rig') !== -1, true, 'miles and the vehicle profile');
t.eq(rt.indexOf('1. mile 413  Hammond, LA') !== -1, true, 'stops carry a route mile');
t.eq(rt.indexOf('0.3 mi off route') !== -1, true, 'and the detour');
t.eq(rt.indexOf('1 walkable Waffle House on this run') !== -1, true, 'singular reads right');

var none = tt.formatRouteText({from:'A', to:'B', miles:300, profile:'Standard rig',
                               tierUsed:6, stops:[]}, 'x');
t.eq(none.indexOf('No walkable Waffle House within 6 mi') !== -1, true,
     'an empty run says so plainly rather than printing an empty list');
t.eq(tt.formatRouteText(null), '', 'no plan, no text');

// The share text carries the street address wherever the row has one - it is
// the line that goes into a truck's nav when this text reaches a phone - and
// keeps the coordinates beside it, because a coordinate pair is the one form
// that pastes anywhere without being re-geocoded into an approximation.
var addrRow = {feet:170, corridor:'I-65', state:'AL', exit:'304', city:'Good Hope',
               ts:"Jack's Truck Stop", lat:34.11486, lon:-86.86387,
               addr:'1707 County Road 437, Cullman, AL 35055', note:''};
var stopTxt = tt.formatStopText(addrRow, 'Atlas Rev 08-2026');
t.eq(stopTxt.indexOf('1707 County Road 437, Cullman, AL 35055') !== -1, true,
     'the stop share carries the street address');
t.eq(stopTxt.indexOf('34.11486, -86.86387') !== -1, true,
     'and still carries the coordinates beside it');
var routeTxt = tt.formatRouteText({from:'A', to:'B', miles:100, profile:'Standard rig',
  tierUsed:1, stops:[{row:addrRow, routeMile:49, detourMi:0.3}]}, 'Atlas Rev 08-2026');
t.eq(routeTxt.indexOf('   1707 County Road 437, Cullman, AL 35055') !== -1, true,
     'each route stop carries its street address');
// ---- BOTH addresses, labelled (v4.15.0) ----
// The card used to name the truck stop and then give only the Waffle House's
// address, which is the wrong half for a driver deciding where to park - the
// walk starts at the truck stop. With two address lines in one message,
// unlabelled is ambiguous, and "which of these do I park at" is the question
// this text exists to answer.
var twoAddr = {feet:347, corridor:'I-65', state:'KY', exit:'121', city:'Brooks',
               ts:'Pilot Travel Center #356', brand:'PIL', lat:37.99, lon:-85.71,
               addr:'2021 E Blue Lick Rd, Shepherdsville, KY 40165',
               tsAddr:'2050 E Blue Lick Rd', flags:[], note:'',
               alt:[{ts:"Love's #123", feet:900, brand:'LOV', tsAddr:'2100 E Blue Lick Rd'}]};
var twoTxt = tt.formatStopText(twoAddr, 'Atlas Rev 13-2026');
t.eq(twoTxt.indexOf('truck stop: 2050 E Blue Lick Rd') !== -1, true,
     'the share carries the truck stop address, labelled');
t.eq(twoTxt.indexOf('waffle house: 2021 E Blue Lick Rd, Shepherdsville, KY 40165') !== -1, true,
     'and the Waffle House address, labelled to tell them apart');
// An alt stop's address is indented under the stop it belongs to - an
// unlabelled line between two "also:" lines would be anyone's guess.
t.eq(/\nalso: Love's #123 - 900 ft\n      2100 E Blue Lick Rd\n/.test(twoTxt), true,
     "an alt stop's address sits indented under its own line");
// A row the audit has produced no truck stop address for must not emit a
// label with nothing after it.
var oneAddr = tt.formatStopText({feet:200, corridor:'I-10', state:'AL', exit:'1', city:'X',
  ts:'TA', brand:'TA', lat:1, lon:2, addr:'1 Main St, X, AL', flags:[]}, 'Rev');
t.eq(oneAddr.indexOf('truck stop:') === -1, true,
     'no empty truck-stop label on a row without one');
t.eq(oneAddr.indexOf('undefined') === -1, true, 'and nothing leaks through as undefined');

// A row without an address (an old fixture, a future row before generation)
// must not print a blank or the word "undefined".
var bare = {feet:170, corridor:'I-65', state:'AL', exit:'304', city:'X',
            ts:'T', lat:34.1, lon:-86.8, note:''};
t.eq(tt.formatStopText(bare, 'Rev').indexOf('undefined') === -1, true,
     'a row with no address shares cleanly');

// ATLAS_REV already starts with the word "Atlas"; the formatter must not add
// its own "Atlas " on top. This stammered "Atlas Atlas" for eleven releases.
t.eq(stopTxt.indexOf('Atlas Atlas') === -1, true, 'stop share does not stammer the rev label');
t.eq(routeTxt.indexOf('Atlas Atlas') === -1, true, 'route share does not either');
t.eq(stopTxt.indexOf('Atlas Rev 08-2026') !== -1, true, 'the rev line itself survives');

// A chosen alternative names itself, so a 968 mi run does not read as a
// routing error to whoever receives the text.
var picked = {from:'Dallas, TX', to:'Atlanta, GA', miles:968, profile:'Standard rig',
              stops:[], tierUsed:6, label:'via I-49, I-65', optionCount:5};
t.eq(tt.formatRouteText(picked, 'Rev').indexOf('via I-49, I-65  (1 of 5 routes)') !== -1, true,
     'a chosen alternative names itself and says how many there were');
// One route is not a choice, and saying "1 of 1" would imply it was.
var only = {from:'A', to:'B', miles:100, profile:'Standard rig', stops:[], tierUsed:6,
            label:'via I-40', optionCount:1};
t.eq(only && tt.formatRouteText(only, 'Rev').indexOf('via I-40') === -1, true,
     'a single-route plan adds no route line at all');
// Older plans carry no label; the text must be unchanged for them.
var unlabelled = {from:'A', to:'B', miles:100, profile:'Standard rig', stops:[], tierUsed:6};
t.eq(tt.formatRouteText(unlabelled, 'Rev').indexOf('(1 of') === -1, true,
     'a plan with no label is formatted exactly as before');

t.done('triptext');
