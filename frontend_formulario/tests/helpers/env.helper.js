const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..', '..');
const envFile = process.env.PW_ENV_FILE || path.join(ROOT, '.env.test');
if (fs.existsSync(envFile)) dotenv.config({ path: envFile, override: false, quiet: true });

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(raw).trim().toLowerCase());
}

function cleanUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, '');
}

const env = Object.freeze({
  root: ROOT,
  baseURL: cleanUrl(process.env.PW_BASE_URL, 'http://127.0.0.1:3200'),
  apiURL: cleanUrl(process.env.PW_API_URL, 'http://127.0.0.1:3201/routes'),
  backendDir: path.resolve(ROOT, process.env.PW_BACKEND_DIR || '../backend'),
  tenantId: Number(process.env.PW_TENANT_ID || 1),
  expectedTenantId: Number(process.env.PW_EXPECTED_TENANT_ID || process.env.PW_TENANT_ID || 1),
  adminUser: String(process.env.PW_ADMIN_USER || 'admin'),
  adminPassword: String(process.env.PW_ADMIN_PASSWORD || '1234'),
  prefix: String(process.env.PW_TEST_PREFIX || 'PWFORM').trim(),
  startFrontend: bool('PW_START_FRONTEND', true),
  startBackend: bool('PW_START_BACKEND', true),
  allowMutations: bool('PW_ALLOW_MUTATIONS', true),
  localOnly: bool('PW_LOCAL_ONLY', true),
  frontendCommand: String(process.env.PW_FRONTEND_COMMAND || 'npm start'),
  frontendPort: Number(process.env.PW_FRONTEND_PORT || 3200),
  backendHost: String(process.env.PW_BACKEND_HOST || '127.0.0.1'),
  backendPort: Number(process.env.PW_BACKEND_PORT || 3201),
});

function isLocalUrl(value) {
  const host = new URL(value).hostname.toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

function assertSafeLocalConfiguration() {
  if (!env.localOnly || !env.allowMutations) {
    throw new Error('BLOQUEADO: PW_LOCAL_ONLY y PW_ALLOW_MUTATIONS deben valer 1.');
  }
  if (!isLocalUrl(env.baseURL) || !isLocalUrl(env.apiURL)) {
    throw new Error(`BLOQUEADO: el formulario y la API deben apuntar a localhost (${env.baseURL} / ${env.apiURL}).`);
  }
  if (!Number.isInteger(env.tenantId) || env.tenantId <= 0 || env.tenantId !== env.expectedTenantId) {
    throw new Error(`BLOQUEADO: tenant ${env.tenantId}; se esperaba ${env.expectedTenantId}.`);
  }
  if (!fs.existsSync(env.backendDir)) {
    throw new Error(`No existe PW_BACKEND_DIR: ${env.backendDir}`);
  }
  if (env.prefix.length < 5) throw new Error('PW_TEST_PREFIX debe tener al menos 5 caracteres.');
}

function unique(label = '') {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  return `${env.prefix}${String(label).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}${suffix}`.slice(0, 95);
}

module.exports = { env, bool, assertSafeLocalConfiguration, unique };
