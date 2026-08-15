// Which base layer the map should be on for a given theme - or null for
// "leave it exactly where it is". No DOM, no network, no HERE objects: the
// layers are compared by identity, so the test can pass plain sentinels.
//
// This one conditional is the whole feature. FuelPost shipped four releases
// (v1.11.6 through v1.11.9) chasing the same report - switch the theme while
// looking at Satellite and the map yanks you back to the road map - and each
// one treated it as a setBaseLayer timing race, adding deferral, then
// idempotency, then internal bookkeeping. None of it was the cause. The cause
// was that the theme handler swapped the base layer without ever asking what
// the map was currently showing.
//
// So the guard is an ALLOW-LIST by identity, never a deny-list naming
// satellite. Anything that is not one of the two themed road layers is
// something the driver chose, or something HERE added that this app does not
// know about, and either way the theme has no business touching it.

// `layers` is either one {light, dark} pair or {pairs:[...]} holding several.
// v4.1.0 made the satellite view themed too - HERE's hybrid stack has day and
// night variants - so there is now more than one pair to keep in step. The
// allow-list property above is what generalises: a layer belonging to NO known
// pair is still something this app did not put there, and is still left alone.
function nextBaseLayer(currentLayer, theme, layers) {
  var pairs = layers && layers.pairs ? layers.pairs : [layers];
  var want = theme === 'dark' ? 'dark' : 'light';
  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    if (!p) continue;
    // Not one of ours: a future HERE default, whatever else tomorrow. Hands off.
    if (currentLayer !== p.light && currentLayer !== p.dark) continue;
    // Already right. Returning null here is also what makes the app's own
    // baselayerchange backstop self-terminating rather than a feedback loop:
    // the correction it triggers produces an event whose next pass asks for
    // nothing.
    return currentLayer === p[want] ? null : p[want];
  }
  return null;
}

module.exports = { nextBaseLayer };
