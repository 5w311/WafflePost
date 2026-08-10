// Alternative routes: naming them, scoring them against the atlas, and
// dropping the ones that are the same driving decision twice. No DOM, no
// network - hand it decoded polylines.
//
// The point of alternatives HERE is not that one is faster. It is that they
// pass DIFFERENT Waffle Houses. Atlanta to Nashville comes back with two
// options that each pass four walkable pairs and share NONE of them.

var rw = require('./routewaffles');

// HERE wraps route labels for localisation: {name:{language:'en',value:'I-24'}}.
// Bare strings appear too. Anything else is a shape we do not know, and must
// yield '' rather than "via [object Object]" in a driver's face.
function labelName(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  var n = entry.name;
  if (typeof n === 'string') return n;
  if (n && typeof n.value === 'string') return n.value;
  return '';
}

// 'via I-24, I-75'. Two road numbers is what a driver says out loud; a third
// is noise. Falls back to a plain ordinal so an unlabelled route is still
// nameable rather than blank.
function labelFor(route, i) {
  var seen = {}, names = [];
  function take(list) {
    (list || []).forEach(function (entry) {
      var name = labelName(entry);
      if (name && !seen[name]) { seen[name] = 1; names.push(name); }
    });
  }
  take(route && route.routeLabels);
  // Per-section labels are where v8 puts them on a multi-section route (a
  // `via` waypoint splits one). Absent on every US truck route tested, but it
  // costs nothing and the fallback below would otherwise be all a via-route got.
  ((route && route.sections) || []).forEach(function (sec) { take(sec.routeLabels); });
  return names.length ? 'via ' + names.slice(0, 2).join(', ') : 'Route ' + (i + 1);
}

// Score EVERY option at ONE shared detour tier.
//
// This exists because rw.stopsAlongRoute widens [1,3,6] independently per
// polyline and returns the first tier that finds anything. Called once per
// option, it will happily report "4 pairs" for a route measured at 1 mile
// beside "3 pairs" for one measured at 6 - two different questions, printed
// as if they were one comparison, with nothing on screen saying so.
//
// So: try the tiers in order, and take the first that finds a pair on ANY
// option. Every option is then scored at that same tier, and an option with
// nothing within it honestly shows zero rather than being quietly widened
// until it has something to show.
function projectAll(polys, rows, tiers) {
  var list = tiers || rw.DETOUR_TIERS;
  for (var i = 0; i < list.length; i++) {
    var perRoute = (polys || []).map(function (poly) {
      return rw.projectStops(poly, rows, list[i]);
    });
    var anyHit = perRoute.some(function (stops) { return stops.length > 0; });
    if (anyHit) return { perRoute: perRoute, tierUsed: list[i], widened: i > 0 };
  }
  return {
    perRoute: (polys || []).map(function () { return []; }),
    tierUsed: list[list.length - 1],
    widened: list.length > 1
  };
}

// Atlas rows have no id, and two options that pass the same exits are the same
// answer to "where can I eat", so the row set IS the identity.
function stopKey(stops) {
  return (stops || []).map(function (s) {
    return s.row.city + '|' + s.row.state + '|' + s.row.exit;
  }).join(',');
}

// HERE returns cosmetically different near-duplicates. Drop an option only
// when it is the same driving decision: near-identical length AND the same
// waffles. Both conditions are load-bearing - a route 186 miles longer past
// the same exits is still a real choice, and one the driver should get to
// refuse for themselves.
function dedupe(options, tolerancePct) {
  var tol = tolerancePct == null ? 0.02 : tolerancePct;
  var kept = [];
  (options || []).forEach(function (o) {
    var key = stopKey(o.stops);
    var dup = kept.some(function (k) {
      if (stopKey(k.stops) !== key) return false;
      var base = Math.max(k.miles, o.miles);
      if (!base) return true;
      return Math.abs(k.miles - o.miles) / base <= tol;
    });
    if (!dup) kept.push(o);
  });
  return kept;
}

module.exports = { labelFor, labelName, projectAll, dedupe, stopKey };
