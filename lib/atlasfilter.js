// Pure filter predicate for the atlas list and map. No DOM, no network.
//
// IMPORTANT - unknown is not the same as false. The audit verified feet,
// corridor, exit, brand and coordinates for every row, but amenity detail
// (free parking, CAT scale, a sit-down diner) was only recorded where a
// review or the stop's own listing confirmed it. So amenity toggles filter
// to "confirmed by the audit", never to "has it" - a stop without the flag
// may well have the amenity and simply was never verified. The UI labels
// them "Confirmed ..." for that reason. Do not relabel these to plain
// "Has parking" without going back and verifying all 66 exits.

var tierFor = require('./waffledist').tierFor;

var TIER_RANK = { porch: 0, short: 1, long: 2, honorary: 3 };

function norm(s) { return (s == null ? '' : String(s)).toLowerCase(); }

function matchesText(row, q) {
  if (!q) return true;
  var hay = [row.city, row.state, row.corridor, row.ts, row.exit, row.note,
             (row.alt || []).map(function (a) { return a.ts; }).join(' ')]
             .map(norm).join(' ');
  return norm(q).split(/\s+/).filter(Boolean)
    .every(function (t) { return hay.indexOf(t) !== -1; });
}

function passes(row, f) {
  f = f || {};
  if (f.corridor && f.corridor !== 'all' && row.corridor !== f.corridor) return false;
  if (f.state && f.state !== 'all' && row.state !== f.state) return false;
  if (f.brand && f.brand !== 'all') {
    var brands = [row.brand].concat((row.alt || []).map(function (a) { return a.brand; }));
    if (brands.indexOf(f.brand) === -1) return false;
  }
  if (f.tier && f.tier !== 'all') {
    var rt = TIER_RANK[tierFor(row.feet)], want = TIER_RANK[f.tier];
    if (rt === undefined || want === undefined || rt > want) return false;
  }
  if (f.doublesOnly && !(row.alt && row.alt.length)) return false;
  if (f.hideFlagged && row.flags && row.flags.indexOf('caution') !== -1) return false;
  if (f.freeParking && !(row.flags || []).length) return false;
  if (f.freeParking && (row.flags || []).indexOf('free') === -1) return false;
  if (f.scale && (row.flags || []).indexOf('scale') === -1) return false;
  if (f.diner && (row.flags || []).indexOf('diner') === -1) return false;
  if (!matchesText(row, f.q)) return false;
  return true;
}

// Counts only the filters a driver could forget they left on. Free text is
// excluded: the box shows its own contents, so badging it would double-report.
function activeFilterCount(f) {
  f = f || {};
  var n = 0;
  ['corridor', 'state', 'brand', 'tier'].forEach(function (k) {
    if (f[k] && f[k] !== 'all') n++;
  });
  ['doublesOnly', 'hideFlagged', 'freeParking', 'scale', 'diner'].forEach(function (k) {
    if (f[k]) n++;
  });
  return n;
}

module.exports = { passes, activeFilterCount, matchesText };
