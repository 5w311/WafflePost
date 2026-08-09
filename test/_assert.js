var pass = 0, fail = 0;
function eq(got, want, msg) {
  if (got === want) { pass++; }
  else { fail++; console.log('  FAIL ' + msg + '\n       got ' + JSON.stringify(got) +
                             ', want ' + JSON.stringify(want)); }
}
function close(got, want, tol, msg) {
  if (typeof got === 'number' && Math.abs(got - want) <= tol) { pass++; }
  else { fail++; console.log('  FAIL ' + msg + '\n       got ' + got + ', want ' +
                             want + ' +/- ' + tol); }
}
function done(name) {
  console.log((fail ? 'FAIL ' : 'ok   ') + name + '  ' + pass + ' passed' +
              (fail ? ', ' + fail + ' failed' : ''));
  if (fail) process.exitCode = 1;
}
module.exports = { eq, close, done };
