var t = require('./_assert'), vp = require('../lib/vehicleprofile');

var std = vp.toHereParams({ mode: 'standard' });
t.eq(std['vehicle[height]'], 412, "13'6\" ceils to 412 cm");
t.eq(std['vehicle[width]'], 260, '102 in ceils to 260 cm - the 2.6 m in 23 CFR 658.15');
t.eq(std['vehicle[length]'], 2134, '70 ft ceils to 2134 cm');
t.eq(std['vehicle[grossWeight]'], 36288, '80,000 lb ceils to 36,288 kg');
t.eq(std.shippedHazardousGoods, undefined, 'standard declares no hazard classes');

// Rounding direction is the whole point: nearest would under-declare.
t.eq(vp.toHereParams({ mode:'custom', heightIn: 100.1 })['vehicle[height]'], 255,
     'a height that lands mid-centimetre rounds UP, never to nearest');

t.eq(vp.HAZMAT_CLASSES.length, 11, 'eleven HERE hazard classes');
var hz = vp.toHereParams({ mode: 'hazmat' });
t.eq(hz.shippedHazardousGoods.split(',').length, 11,
     'hazmat defaults to every class - HERE does not infer between them');
t.eq(hz['vehicle[height]'], 412, 'and still carries the dimensions');
t.eq(vp.toHereParams({ mode:'hazmat', hazmat:['explosive'] }).shippedHazardousGoods,
     'explosive', 'a narrowed selection is sent as given');
t.eq(vp.toHereParams({ mode:'hazmat', hazmat:[] }).shippedHazardousGoods.split(',').length, 11,
     'deselecting every class re-selects all rather than silently sending none');

// A blank field means "use the standard", not zero.
var partial = vp.resolve({ mode:'custom', heightIn:'', grossLb:76000 });
t.eq(partial.heightIn, 162, 'a blank height falls back to the standard');
t.eq(partial.grossLb, 76000, 'while the typed weight is kept');
t.eq(vp.resolve({ mode:'custom', widthIn:'abc' }).widthIn, 102,
     'unparseable input falls back rather than becoming NaN');

t.eq(vp.validate({ mode:'standard' }).ok, true, 'the standard rig validates');
t.eq(vp.validate({ mode:'custom', heightIn: 1000 }).ok, false, 'a typo\'d height is blocked');
t.eq(vp.validate({ mode:'custom', heightIn: 1000 }).errors.length, 1, 'and named');
t.eq(vp.validate({ mode:'custom', grossLb: 500 }).ok, false, 'as is an impossible weight');

t.eq(vp.resolve({ mode:'nonsense' }).mode, 'standard', 'an unknown mode falls back to standard');
t.eq(vp.label({ mode:'standard' }), 'Standard rig', 'label names the profile');
t.eq(vp.label({ mode:'hazmat', hazmat:['gas'] }), 'Hazmat \u00b7 1 class', 'singular reads right');
t.done('vehicleprofile');
