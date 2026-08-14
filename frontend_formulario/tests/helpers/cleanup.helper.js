const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { env, assertSafeLocalConfiguration } = require('./env.helper');

function runCleaner(args = []) {
  assertSafeLocalConfiguration();
  const script = path.join(env.backendDir, 'testing', 'cleanup_playwright.php');
  if (!fs.existsSync(script)) throw new Error(`Falta el limpiador seguro: ${script}`);
  const stdout = execFileSync('php', [
    script,
    `--tenant=${env.tenantId}`,
    `--prefix=${env.prefix}`,
    '--json',
    ...args,
  ], { cwd: env.backendDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const raw = stdout.split(/\r?\n/).filter(Boolean).pop() || '{}';
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(result.error || raw);
  return result;
}

const assertSafeDatabase = () => runCleaner(['--assert-safe']);
const cleanupAll = () => runCleaner(['--cleanup', '--restore-snapshots']);
const snapshotFormConfig = () => runCleaner(['--snapshot-form-config']);
const snapshotPrevias = () => runCleaner(['--snapshot-previas-inscripciones']);
const disableConfirmationEmail = () => runCleaner(['--disable-form-confirmation-email']);
const findSafeCatedra = () => runCleaner(['--find-safe-catedra']).catedra;

module.exports = {
  runCleaner,
  assertSafeDatabase,
  cleanupAll,
  snapshotFormConfig,
  snapshotPrevias,
  disableConfirmationEmail,
  findSafeCatedra,
};
