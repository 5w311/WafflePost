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
    // Indented under the stop it belongs to. An unlabelled address line
    // between two 'also:' lines would be anyone's guess.
    if (a.tsAddr) out.push('      ' + a.tsAddr);
  });
  if (row.note) out.push('! ' + row.note);
  // Both forms of "where", together at the bottom. The address is what a
  // person reads aloud or recognises; the coordinates stay because they are
  // the one form that drops into any nav app or dispatch field without being
  // re-geocoded into an approximation of itself.
  //
  // LABELLED SINCE v4.15.0, because there are now two of them. One bare
  // address line was unambiguous; two are not, and "which of these do I park
  // at" is exactly the question this message exists to answer. The labels are
  // lowercase to match 'also:' and '! ' rather than shouting at a dispatcher.
  if (row.tsAddr) out.push('truck stop: ' + row.tsAddr);
  if (row.addr) out.push('waffle house: ' + row.addr);
  out.push(row.lat.toFixed(5) + ', ' + row.lon.toFixed(5));
  // rev is ATLAS_REV, which already starts with the word "Atlas". Prefixing
  // another "Atlas " here is how this text stammered "Atlas Atlas" for
  // eleven releases before anyone read their own share message.
  out.push(rev || '');
  return out.join('\n');
}

function formatRouteText(plan, rev) {
  if (!plan) return '';
  var out = ['WAFFLEPOST',
             plan.from + '  ->  ' + plan.to,
             Math.round(plan.miles).toLocaleString('en-US') + ' mi  |  ' + plan.profile];

  // Only when there was genuinely a choice. A dispatcher reading a 968 mile
  // Dallas-Atlanta needs to know it is a deliberate pick and not a routing
  // error; with one route there is nothing to disambiguate and the text stays
  // exactly as it has always been.
  if (plan.label && plan.optionCount > 1) {
    out.push(plan.label + '  (1 of ' + plan.optionCount + ' routes)');
  }
  out.push('');

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
      // The address is the line a driver actually uses at the wheel - it is
      // what goes into the truck's own nav when this text reaches a phone.
      if (s.row.addr) out.push('   ' + s.row.addr);
      if (s.row.note) out.push('   ! ' + s.row.note);
    });
  }
  out.push('', 'Walk distances are truck stop to Waffle House, straight line.',
           // Same "Atlas Atlas" fix as formatStopText: rev carries its own label.
           rev || '');
  return out.join('\n');
}

module.exports = { formatStopText, formatRouteText };
