// Vehicle dimensions and hazmat classes -> HERE vehicle[...] parameters.
// No DOM, no network.
//
// transportMode=truck ON ITS OWN applies NO dimensions. HERE's docs are
// explicit: absent vehicle parameters default to "0 or none", so general
// truck access rules apply and nothing dimensional does. A 13'6" truck can be
// routed under a 12' bridge. These parameters are the difference between a
// legal route and a plausible-looking one.

var IN_TO_CM = 2.54, LB_TO_KG = 0.45359237, FT_TO_IN = 12;

// Federal maximums for a typical 5-axle rig. Correct for most freight, but
// an assumption about equipment, not a measurement of any specific tractor -
// which is what Custom is for.
var STANDARD = { heightIn: 162, widthIn: 102, lengthFt: 70, grossLb: 80000 };

// HERE's shippedHazardousGoods enum. FuelPost checked all eleven against
// HERE's live OpenAPI spec; if these ever disagree with that copy, that copy
// wins - it was verified against the running service and this one was not.
var HAZMAT_CLASSES = ['explosive','gas','flammable','combustible','organic',
                      'poison','radioActive','corrosive','poisonousInhalation',
                      'harmfulToWater','other'];

// Sanity rails, not legal limits - this app does not pretend to know every
// state's permit rules. They exist to block the typo'd height, which is
// exactly the input that produces a confident illegal route.
var RAILS = {
  heightIn: [96, 180], widthIn: [60, 120],
  lengthFt: [20, 120], grossLb: [5000, 200000]
};

function num(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  var n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}

// A blank field falls back to the standard value, so changing one number does
// not mean typing four.
function resolve(profile) {
  profile = profile || {};
  return {
    mode: profile.mode === 'custom' || profile.mode === 'hazmat' ? profile.mode : 'standard',
    heightIn: num(profile.heightIn, STANDARD.heightIn),
    widthIn:  num(profile.widthIn,  STANDARD.widthIn),
    lengthFt: num(profile.lengthFt, STANDARD.lengthFt),
    grossLb:  num(profile.grossLb,  STANDARD.grossLb),
    hazmat:   (profile.hazmat && profile.hazmat.length) ? profile.hazmat.slice() : HAZMAT_CLASSES.slice()
  };
}

function validate(profile) {
  var r = resolve(profile), errors = [];
  Object.keys(RAILS).forEach(function (k) {
    var v = r[k], lo = RAILS[k][0], hi = RAILS[k][1];
    if (!(v >= lo && v <= hi)) errors.push(k + ' must be between ' + lo + ' and ' + hi);
  });
  return { ok: errors.length === 0, errors: errors, resolved: r };
}

// Conversions round UP, never to nearest. Under-declaring makes HERE believe
// the truck fits where it does not; over-declaring at worst costs a slightly
// longer legal route. Those errors are not symmetric. 102 in ceils to 260 cm,
// which is exactly the 2.6 m that 23 CFR 658.15 names as the metric
// equivalent of the 102-inch limit - rounding to nearest would under-declare
// against the regulation's own wording.
function toHereParams(profile) {
  var r = resolve(profile), p = {};
  p['vehicle[height]']      = Math.ceil(r.heightIn * IN_TO_CM);
  p['vehicle[width]']       = Math.ceil(r.widthIn  * IN_TO_CM);
  p['vehicle[length]']      = Math.ceil(r.lengthFt * FT_TO_IN * IN_TO_CM);
  p['vehicle[grossWeight]'] = Math.ceil(r.grossLb  * LB_TO_KG);
  // HERE does not infer between hazard classes - declaring gas does not
  // exclude roads barred to flammables - so a blanket "hazmat: yes" cannot
  // route correctly. Classes are sent explicitly or not at all.
  if (r.mode === 'hazmat') p.shippedHazardousGoods = r.hazmat.join(',');
  return p;
}

function label(profile) {
  var r = resolve(profile);
  if (r.mode === 'standard') return 'Standard rig';
  if (r.mode === 'hazmat') return 'Hazmat \u00b7 ' + r.hazmat.length + ' class' +
                                  (r.hazmat.length === 1 ? '' : 'es');
  return 'Custom \u00b7 ' + r.heightIn + '" H \u00b7 ' +
         r.grossLb.toLocaleString('en-US') + ' lb';
}

module.exports = { STANDARD, HAZMAT_CLASSES, RAILS, resolve, validate,
                   toHereParams, label };
