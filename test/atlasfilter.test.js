var t = require('./_assert'), af = require('../lib/atlasfilter');

var row = { feet: 205, corridor: 'I-55', state: 'LA', exit: '28', city: 'Hammond',
            ts: 'Pilot', brand: 'PIL', flags: ['diner'],
            alt: [{ ts: 'Petro Iron Skillet', feet: 659, brand: 'PET' }] };
var lonely = { feet: 753, corridor: 'I-85', state: 'GA', exit: '149', city: 'Commerce',
               ts: 'TA', brand: 'TA', flags: [] };
var rough = { feet: 1885, corridor: 'I-20', state: 'TX', exit: '617', city: 'Marshall',
              ts: 'Marshall Truck Stop', brand: 'IND', flags: ['caution'] };

t.eq(af.passes(row, {}), true, 'no filters passes everything');
t.eq(af.passes(row, { corridor: 'I-55' }), true, 'corridor match');
t.eq(af.passes(row, { corridor: 'I-10' }), false, 'corridor miss');
t.eq(af.passes(row, { brand: 'PET' }), true, 'the SECOND stop brand counts too');
t.eq(af.passes(lonely, { brand: 'PET' }), false, 'no Petro at Commerce');
t.eq(af.passes(row, { tier: 'porch' }), true, '205 ft is within porch');
t.eq(af.passes(lonely, { tier: 'porch' }), false, '753 ft is not');
t.eq(af.passes(lonely, { tier: 'short' }), true, 'tier filter is a ceiling, not a band');
t.eq(af.passes(row, { doublesOnly: true }), true, 'Hammond is a double');
t.eq(af.passes(lonely, { doublesOnly: true }), false, 'Commerce is not');
t.eq(af.passes(rough, { hideFlagged: true }), false, 'Marshall hides when flagged out');
t.eq(af.passes(rough, {}), true, 'and shows by default - flagged is not hidden');
t.eq(af.passes(row, { diner: true }), true, 'confirmed diner');
t.eq(af.passes(lonely, { diner: true }), false, 'unconfirmed is filtered out, by design');

t.eq(af.passes(row, { q: 'hammond' }), true, 'search by city');
t.eq(af.passes(row, { q: 'iron skillet' }), true, 'search reaches the alternate stop');
t.eq(af.passes(row, { q: 'hammond la 28' }), true, 'all terms must match, any order');
t.eq(af.passes(row, { q: 'hammond ohio' }), false, 'one bad term fails the row');

t.eq(af.activeFilterCount({}), 0, 'nothing set');
t.eq(af.activeFilterCount({ corridor: 'all', state: 'all' }), 0, '"all" is not a filter');
t.eq(af.activeFilterCount({ corridor: 'I-10', scale: true, q: 'x' }), 2,
     'free text is deliberately not badged');
t.done('atlasfilter');
