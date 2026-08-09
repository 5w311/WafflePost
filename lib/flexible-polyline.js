// PLACEHOLDER - not the real decoder.
//
// HERE encodes route geometry as a "flexible polyline" and publishes a
// reference decoder under MIT. FuelPost already vendors that file, unmodified,
// and it has been decoding real HERE responses in production for many
// versions. Copy that proven file over the top of this one:
//
//     cp ../FuelPost/lib/flexible-polyline.js lib/flexible-polyline.js
//
// It is deliberately NOT reimplemented here. A decoder is exactly the kind of
// code that looks right, passes a hand-written test, and then quietly puts a
// route in the wrong hemisphere on some real response you did not think to
// try - and this repo has no way to call HERE and check. Vendoring the copy
// that is already known to work against live responses is the lower-risk
// move, and it keeps one decoder between the two apps rather than two that
// can drift.
//
// Route mode is the only thing that touches this file. Atlas, Near me and
// Corridor never decode anything.

function decode() {
  throw new Error(
    'Polyline decoder not installed. Copy lib/flexible-polyline.js from ' +
    'FuelPost into this repo - Route mode needs it to read HERE geometry.');
}

module.exports = { decode: decode, __placeholder: true };
