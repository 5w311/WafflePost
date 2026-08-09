// Pure helpers behind the pickup/delivery autosuggest, vendored unmodified
// from FuelPost so both apps share one implementation. The DOM wiring and the
// HERE call live in index.html; everything decidable without a network is
// here.
var t = require('./_assert');
var as = require('../lib/autosuggest.js');

// The 3-char minimum is a call-volume decision, not a UX one: autosuggest
// fires per keystroke where geocode/route fire once per plan, and the key is
// public. Lowering it is a cost change - this pins it so that is deliberate.
t.eq(as.MIN_QUERY_LEN, 3, 'minimum query length is 3');

t.eq(as.shouldFireQuery('Mem'), true, 'fires at exactly the minimum');
t.eq(as.shouldFireQuery('Me'), false, 'does not fire below it');
t.eq(as.shouldFireQuery('  Memphis  '), true, 'trims before measuring');
t.eq(as.shouldFireQuery('   '), false, 'whitespace alone is not a query');
t.eq(as.shouldFireQuery(''), false, 'empty string does not fire');
// A cleared field arrives as '' from an input, but the callers are wired by
// hand and a null slipping through must not throw inside a keystroke handler.
t.eq(as.shouldFireQuery(null), false, 'null does not fire');
t.eq(as.shouldFireQuery(undefined), false, 'undefined does not fire');
t.eq(as.shouldFireQuery(123), false, 'a non-string does not fire');

// ---- candidateFromSuggestItem ----
// The common case: an address result that already carries its position, so
// tapping it needs no follow-up call at all.
var withPos = as.candidateFromSuggestItem({
  title: '2000 Distribution Way',
  id: 'here:af:street:abc',
  address: { label: '2000 Distribution Way, Memphis, TN 38118, United States' },
  position: { lat: 35.0456, lng: -89.9773 }
});
t.eq(withPos.needsLookup, false, 'a positioned item needs no lookup');
t.eq(withPos.lat, 35.0456, 'latitude is carried through');
t.eq(withPos.lng, -89.9773, 'longitude is carried through');
t.eq(withPos.label, '2000 Distribution Way, Memphis, TN 38118, United States',
     'the full address label wins over the bare title');
t.eq(withPos.id, 'here:af:street:abc', 'the id is carried through');

// address.label is preferred, but a result without one still has to render.
t.eq(as.candidateFromSuggestItem({title: 'Memphis', position: {lat: 35.1, lng: -90.0}}).label,
     'Memphis', 'falls back to title when there is no address label');

// categoryQuery/chainQuery items carry no position of their own - they must be
// flagged rather than silently producing a candidate with undefined coords,
// which is how a route gets planned to nowhere.
var noPos = as.candidateFromSuggestItem({
  title: 'Truck Stops', id: 'here:cq:xyz',
  address: { label: 'Truck Stops near Memphis' }
});
t.eq(noPos.needsLookup, true, 'an item with no position needs a lookup');
t.eq(noPos.lat, undefined, 'and carries no latitude to plan against');
t.eq(noPos.lng, undefined, 'and carries no longitude to plan against');
t.eq(noPos.id, 'here:cq:xyz', 'but keeps the id the lookup needs');

// A position that is present but not numeric is not a position. Guarding on
// typeof rather than truthiness also keeps lat:0 / lng:0 usable.
t.eq(as.candidateFromSuggestItem({title:'x', position:{lat:'35.1', lng:-90}}).needsLookup, true,
     'a string latitude is treated as no position');
t.eq(as.candidateFromSuggestItem({title:'x', position:{lat:35.1}}).needsLookup, true,
     'a missing longitude is treated as no position');
t.eq(as.candidateFromSuggestItem({title:'Null Island', position:{lat:0, lng:0}}).needsLookup, false,
     'zero coordinates are a real position, not a falsy one');

// Malformed input returns null rather than throwing - this runs inside a
// response handler, and one bad item must not take the whole list down.
t.eq(as.candidateFromSuggestItem(null), null, 'null item yields null');
t.eq(as.candidateFromSuggestItem(undefined), null, 'undefined item yields null');
t.eq(as.candidateFromSuggestItem({}), null, 'an item with no title yields null');
t.eq(as.candidateFromSuggestItem({address:{label:'x'}}), null,
     'a label without a title still yields null');

t.done('autosuggest');
