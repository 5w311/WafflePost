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
t.done('triptext');
