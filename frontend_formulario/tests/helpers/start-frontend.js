const { spawn } = require('child_process');
const { env, assertSafeLocalConfiguration } = require('./env.helper');

assertSafeLocalConfiguration();

const childEnv = {
  ...process.env,
  PORT: String(env.frontendPort),
  BROWSER: 'none',
  CI: 'false',
  REACT_APP_API_URL: env.apiURL,
};

const win = process.platform === 'win32';
const executable = win ? 'cmd.exe' : '/bin/sh';
const args = win
  ? ['/d', '/s', '/c', env.frontendCommand]
  : ['-lc', env.frontendCommand];

const child = spawn(executable, args, {
  cwd: env.root,
  env: childEnv,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.error(`No se pudo iniciar React: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code == null ? 0 : code));

function stop() {
  if (!child.killed) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
