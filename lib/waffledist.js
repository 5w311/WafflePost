// Walk math for the atlas: straight-line distance, walk time, and the tier
// bands the whole app is organised around. No DOM, no network.

var WALK_MPH = 3.1;          // average adult walking pace, level ground
var FT_PER_MI = 5280;

// The bands are the audit's own vocabulary, not arbitrary buckets:
//   porch    - close enough that you can see your truck from the counter
//   short    - a normal walk across a lot and a frontage road
//   long     - a real walk; still under the 0.4 mi walkable line (2112 ft)
//   honorary - past the line, admitted only on driver-review evidence
var TIERS = [
  { id: 'porch',    label: 'Front porch', max: 500 },
  { id: 'short',    label: 'Short walk',  max: 1000 },
  { id: 'long',     label: 'Long walk',   max: 2112 },
  { id: 'honorary', label: 'Honorary',    max: Infinity }
];

var WALKABLE_FT = 2112;      // 0.4 mi - the line the audit drew

function haversine(a, b) {
  if (!a || !b) return null;
  var R = 3958.8, rad = Math.PI / 180;
  var la1 = a.lat * rad, la2 = b.lat * rad;
  var dla = (b.lat - a.lat) * rad, dlo = (b.lon - a.lon) * rad;
  var h = Math.sin(dla / 2) * Math.sin(dla / 2) +
          Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function tierFor(feet) {
  if (typeof feet !== 'number' || !isFinite(feet) || feet < 0) return null;
  for (var i = 0; i < TIERS.length; i++) if (feet <= TIERS[i].max) return TIERS[i].id;
  return 'honorary';
}

// Rounded to the half minute. Under a minute reads as "under a minute" at the
// call site - a "0 min" walk is not a useful thing to tell a driver.
function walkMinutes(feet, mph) {
  if (typeof feet !== 'number' || !isFinite(feet) || feet < 0) return null;
  var speed = mph || WALK_MPH;
  var mins = (feet / FT_PER_MI) / speed * 60;
  return Math.round(mins * 2) / 2;
}

function isWalkable(feet) {
  return typeof feet === 'number' && isFinite(feet) && feet >= 0 && feet <= WALKABLE_FT;
}

// Round trip, because a driver walking to a Waffle House walks back.
function roundTripMinutes(feet, mph) {
  var one = walkMinutes(feet, mph);
  return one === null ? null : one * 2;
}

// Under ten miles a driver wants the decimal; over it, they do not.
function formatMiles(mi) {
  if (typeof mi !== 'number' || !isFinite(mi)) return '';
  return (mi < 10 ? mi.toFixed(1) : String(Math.round(mi))) + ' mi';
}

module.exports = { haversine, tierFor, walkMinutes, roundTripMinutes, isWalkable,
                   formatMiles, TIERS, WALK_MPH, WALKABLE_FT, FT_PER_MI };
