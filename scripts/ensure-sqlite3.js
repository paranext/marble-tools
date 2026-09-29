// The prebuilt sqlite3 binary for Linux needs glibc 2.38+. On older distros (e.g. Ubuntu 22.04),
// rebuild it from source so it loads. No-op everywhere the prebuilt binary works, including
// Windows, where spawning `npm` below would need `shell: true`.
const { spawnSync } = require('child_process');

function loadError() {
  const result = spawnSync(process.execPath, ['-e', "require('sqlite3')"], { encoding: 'utf8' });
  return result.status === 0 ? undefined : result.stderr;
}

const error = loadError();
if (error === undefined || !/GLIBC_[\d.]+' not found/.test(error)) process.exit(0);

console.log('Prebuilt sqlite3 needs a newer glibc than this system has. Building from source...');
const rebuild = spawnSync('npm', ['rebuild', 'sqlite3', '--build-from-source'], {
  stdio: 'inherit',
});
if (rebuild.status !== 0 || loadError() !== undefined) {
  console.error('Building sqlite3 from source failed. It needs Python, make and a C++ compiler.');
  process.exit(1);
}
