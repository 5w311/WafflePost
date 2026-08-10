// Alternative-route naming, scoring and de-duplication. Pure; no network.
var t = require('./_assert');
var ro = require('../lib/routeoptions.js');

// ---- labelFor ----
// HERE's real shape, verified against live truck responses.
t.eq(ro.labelFor({routeLabels:[
  {label_type:'RouteNumber', name:{language:'en', value:'I-24'}},
  {label_type:'RouteNumber', name:{language:'en', value:'I-75'}}]}, 0),
  'via I-24, I-75', 'unwraps HERE\'s localisation wrapper');
t.eq(ro.labelFor({routeLabels:[{name:'I-20'}]}, 0), 'via I-20', 'accepts a bare string name');
t.eq(ro.labelFor({routeLabels:['I-40']}, 0), 'via I-40', 'accepts a bare string entry');

// Two road numbers is what a driver says out loud; a third is noise.
t.eq(ro.labelFor({routeLabels:[{name:{value:'I-49'}},{name:{value:'I-65'}},{name:{value:'US-431'}}]}, 0),
     'via I-49, I-65', 'takes at most two names');
t.eq(ro.labelFor({routeLabels:[{name:{value:'I-10'}},{name:{value:'I-10'}},{name:{value:'I-12'}}]}, 0),
     'via I-10, I-12', 'dedupes repeated road numbers');

// The failure that would otherwise reach a driver's screen.
t.eq(ro.labelFor({routeLabels:[{label_type:'RouteNumber'}]}, 2), 'Route 3',
     'an unrecognised label shape never renders as [object Object]');
t.eq(ro.labelFor({routeLabels:[]}, 2), 'Route 3', 'no labels falls back to an ordinal');
t.eq(ro.labelFor({}, 0), 'Route 1', 'a route with no routeLabels key falls back');
t.eq(ro.labelFor(null, 4), 'Route 5', 'a null route still yields a name');
t.eq(ro.labelName({name:{value:'I-95'}}), 'I-95', 'labelName unwraps');
t.eq(ro.labelName({foo:1}), '', 'labelName rejects an unknown shape');

// Per-section labels: where v8 puts them when a `via` waypoint splits a route.
t.eq(ro.labelFor({sections:[{routeLabels:[{name:{value:'I-30'}}]},
                            {routeLabels:[{name:{value:'I-40'}}]}]}, 0),
     'via I-30, I-40', 'falls through to per-section labels');

// ---- projectAll: the tier trap ----
// Two routes. A has a row sitting on it; B's nearest row is far off. Scored
// independently, stopsAlongRoute would widen B to 6 mi and report a hit,
// making "1 pair vs 1 pair" out of two different questions.
var ROWS = [
  {city:'Near', state:'AL', exit:'1', lat:34.0000, lon:-86.0000},
  {city:'Far',  state:'AL', exit:'2', lat:34.0600, lon:-87.0000}   // ~4 mi off route B
];
var POLY_A = [[33.99,-86.00],[34.01,-86.00]];   // runs through Near
var POLY_B = [[33.99,-87.00],[34.01,-87.00]];   // Far is ~4 mi north of this

var pa = ro.projectAll([POLY_A, POLY_B], ROWS);
t.eq(pa.tierUsed, 1, 'the tightest tier that finds anything on ANY option wins');
t.eq(pa.widened, false, 'and it is not marked widened');
t.eq(pa.perRoute.length, 2, 'one stop list per option');
t.eq(pa.perRoute[0].length, 1, 'the option with a close row scores it');
t.eq(pa.perRoute[0][0].row.city, 'Near', 'and it is the right row');
// The whole point: B is NOT quietly widened to 6 mi to give it something.
t.eq(pa.perRoute[1].length, 0, 'the other option honestly shows zero at that same tier');

// When nothing is close on any option, widening is shared too.
var wide = ro.projectAll([POLY_B], ROWS);
t.eq(wide.tierUsed, 6, 'widens only when no option had a hit at a tighter tier');
t.eq(wide.widened, true, 'and says so');
t.eq(wide.perRoute[0].length, 1, 'finding the far row at the widened tier');

t.eq(ro.projectAll([], ROWS).perRoute.length, 0, 'no polylines yields no lists');
t.eq(ro.projectAll([POLY_A], []).perRoute[0].length, 0, 'no rows yields no stops');

// ---- dedupe ----
function opt(miles, cities){
  return {miles:miles, stops:cities.map(function(c){
    return {row:{city:c, state:'GA', exit:'1'}};
  })};
}
t.eq(ro.dedupe([opt(100,['A','B']), opt(101,['A','B'])]).length, 1,
     'same rows within 2% length collapses');
t.eq(ro.dedupe([opt(100,['A','B']), opt(120,['A','B'])]).length, 2,
     'same rows at +20% length is a real choice and is kept');
t.eq(ro.dedupe([opt(100,['A','B']), opt(100,['C','D'])]).length, 2,
     'same length past different waffles is kept');
t.eq(ro.dedupe([opt(100,['A']), opt(100,['A']), opt(100,['A'])]).length, 1,
     'three identical options collapse to one');
// The first is kept, so HERE's own ordering survives de-duplication.
t.eq(ro.dedupe([opt(100,['A']), opt(101,['A'])])[0].miles, 100,
     'the first of a duplicate pair is the one kept');
t.eq(ro.dedupe([]).length, 0, 'empty in, empty out');
t.eq(ro.dedupe([opt(0,[]), opt(0,[])]).length, 1, 'zero-mile options do not divide by zero');

t.done('routeoptions');
