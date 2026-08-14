const { spawn } = require('child_process');
const { env, assertSafeLocalConfiguration } = require('./env.helper');

assertSafeLocalConfiguration();

const child = spawn(
  'php',
  ['-S', `${env.backendHost}:${env.backendPort}`, '-t', '.'],
  {
    cwd: env.backendDir,
    env: { ...process.env },
    stdio: 'inherit',
    windowsHide: true,
  },
);

child.on('error', (error) => {
  console.error(`No se pudo iniciar PHP: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code == null ? 0 : code));

function stop() {
  if (!child.killed) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
