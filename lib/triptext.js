// Formats a stop, or a planned run, as plain text for the share sheet.
// No DOM, no network.

var wd = require('./waffledist');

function ftLine(row) {
  var mins = wd.walkMinutes(row.feet);
  var walk = mins < 1 ? 'under a minute' : mins + ' min';
  return row.feet.toLocaleString('en-US') + ' ft (' + walk + ' walk)';
}

function formatStopText(row, rev) {
  var out = ['WAFFLEPOST',
             row.city + ', ' + row.state + '  ' + row.corridor + ' exit ' + row.exit,
             row.ts, ftLine(row)];
  (row.alt || []).forEach(function (a) {
    out.push('also: ' + a.ts + ' - ' + a.feet.toLocaleString('en-US') + ' ft');
  });
  if (row.note) out.push('! ' + row.note);
  out.push(row.lat.toFixed(5) + ', ' + row.lon.toFixed(5));
  out.push('Atlas ' + (rev || ''));
  return out.join('\n');
}

function formatRouteText(plan, rev) {
  if (!plan) return '';
  var out = ['WAFFLEPOST',
             plan.from + '  ->  ' + plan.to,
             Math.round(plan.miles).toLocaleString('en-US') + ' mi  |  ' + plan.profile, ''];

  if (!plan.stops.length) {
    out.push('No walkable Waffle House within ' + plan.tierUsed +
             ' mi of this route.');
  } else {
    out.push(plan.stops.length + ' walkable Waffle House' +
             (plan.stops.length === 1 ? '' : 's') + ' on this run:', '');
    plan.stops.forEach(function (s, i) {
      out.push((i + 1) + '. mile ' + Math.round(s.routeMile) + '  ' +
               s.row.city + ', ' + s.row.state + '  ' + s.row.corridor + ' exit ' + s.row.exit);
      out.push('   ' + s.row.ts + ' - ' + ftLine(s.row) +
               ', ' + s.detourMi.toFixed(1) + ' mi off route');
      if (s.row.note) out.push('   ! ' + s.row.note);
    });
  }
  out.push('', 'Walk distances are truck stop to Waffle House, straight line.',
           'Atlas ' + (rev || ''));
  return out.join('\n');
}

module.exports = { formatStopText, formatRouteText };
