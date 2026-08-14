const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { env } = require('./env.helper');

function cleanupScript() {
  const file = path.join(env.backendDir, 'testing', 'cleanup_playwright.php');
  if (!fs.existsSync(file)) throw new Error(`No existe el limpiador Playwright: ${file}`);
  return file;
}

function runCleaner(args = [], { silent = false } = {}) {
  const common = [cleanupScript(), `--tenant=${env.tenantId}`, `--prefix=${env.prefix}`, '--json', ...args];
  const stdout = execFileSync('php', common, {
    cwd: env.backendDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const raw = lines[lines.length - 1] || '{}';
  const data = JSON.parse(raw);
  if (!data.ok) throw new Error(data.error || `cleanup_playwright.php falló: ${raw}`);
  if (!silent) console.log(`[PW cleanup] ${data.message || 'OK'}`);
  return data;
}

function assertLocalBackendDatabases() {
  return runCleaner(['--assert-safe'], { silent: true });
}

function cleanupAll(options = {}) {
  const args = ['--cleanup', '--restore-snapshots'];
  if (options.includeSessions) args.push('--cleanup-playwright-sessions');
  return runCleaner(args, options);
}

function findSafeCatedra() {
  return runCleaner(['--find-safe-catedra'], { silent: true }).catedra;
}

function snapshotCatedra(idCatedra) {
  return runCleaner([`--snapshot-catedra=${Number(idCatedra)}`], { silent: true });
}

function snapshotFormConfig() {
  return runCleaner(['--snapshot-form-config'], { silent: true });
}

function snapshotPreviasInscripciones() {
  return runCleaner(['--snapshot-previas-inscripciones'], { silent: true });
}

function disableFormConfirmationEmail() {
  return runCleaner(['--disable-form-confirmation-email'], { silent: true });
}

function linkPreviaMesa(idPrevia) {
  return runCleaner([`--link-previa-mesa=${Number(idPrevia)}`], { silent: true }).vinculo;
}

function snapshotMesas() {
  return runCleaner(['--snapshot-mesas'], { silent: true });
}

function prepareMesasFixture() {
  // Recupera primero cualquier snapshot dejado por una ejecución interrumpida.
  cleanupAll({ silent: true });
  return runCleaner(['--prepare-mesas-fixture'], { silent: true }).fixture;
}

function mesasState() {
  return runCleaner(['--mesas-state'], { silent: true }).state;
}

function addMesasTeacherBlock(idDocente, fecha, idTurno) {
  return runCleaner([
    `--mesas-add-block=${Number(idDocente)},${String(fecha)},${Number(idTurno)}`,
  ], { silent: true }).block;
}

function restoreSnapshots() {
  return runCleaner(['--restore-snapshots'], { silent: true });
}

module.exports = {
  runCleaner,
  assertLocalBackendDatabases,
  cleanupAll,
  findSafeCatedra,
  snapshotCatedra,
  snapshotFormConfig,
  snapshotPreviasInscripciones,
  disableFormConfirmationEmail,
  linkPreviaMesa,
  snapshotMesas,
  prepareMesasFixture,
  mesasState,
  addMesasTeacherBlock,
  restoreSnapshots,
};
