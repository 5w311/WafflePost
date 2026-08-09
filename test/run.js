var fs = require('fs'), path = require('path'), cp = require('child_process');
var dir = __dirname, fail = 0;
fs.readdirSync(dir).filter(function(f){ return /\.test\.js$/.test(f); }).sort()
  .forEach(function(f){
    var r = cp.spawnSync(process.execPath, [path.join(dir, f)], {encoding:'utf8'});
    process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) fail++;
  });
console.log(fail ? '\n' + fail + ' file(s) failed' : '\nall green');
process.exit(fail ? 1 : 0);
