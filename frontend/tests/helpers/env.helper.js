const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function envBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(raw).trim().toLowerCase());
}

function localHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function loadTestEnv(rootDir = path.resolve(__dirname, '..', '..')) {
  if (loaded) return process.env;
  const envPath = process.env.PW_ENV_FILE || path.join(rootDir, '.env.test');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }

  process.env.PW_BASE_URL = String(process.env.PW_BASE_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
  process.env.PW_API_URL = String(process.env.PW_API_URL || 'http://127.0.0.1:3101/routes').replace(/\/+$/, '');
  process.env.PW_BACKEND_DIR = process.env.PW_BACKEND_DIR || '../backend';
  process.env.PW_ADMIN_USER = process.env.PW_ADMIN_USER || process.env.PW_USER || 'admin';
  process.env.PW_ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || process.env.PW_PASSWORD || '1234';
  process.env.PW_VISTA_USER = process.env.PW_VISTA_USER || '';
  process.env.PW_VISTA_PASSWORD = process.env.PW_VISTA_PASSWORD || '';
  process.env.PW_TEST_PREFIX = process.env.PW_TEST_PREFIX || 'PWTEST';
  process.env.REACT_APP_API_URL = process.env.PW_API_URL;

  loaded = true;
  return process.env;
}

loadTestEnv();

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..');
const baseURL = process.env.PW_BASE_URL;
const apiURL = process.env.PW_API_URL;

const env = Object.freeze({
  root: FRONTEND_ROOT,
  baseURL,
  apiURL,
  tenantId: Number(process.env.PW_TENANT_ID || 1),
  expectedTenantId: String(process.env.PW_EXPECTED_TENANT_ID || process.env.PW_TENANT_ID || '1').trim(),
  expectedTenantName: String(process.env.PW_EXPECTED_TENANT_NAME || '').trim(),
  adminUser: String(process.env.PW_ADMIN_USER || '').trim(),
  adminPassword: String(process.env.PW_ADMIN_PASSWORD || ''),
  vistaUser: String(process.env.PW_VISTA_USER || '').trim(),
  vistaPassword: String(process.env.PW_VISTA_PASSWORD || ''),
  prefix: String(process.env.PW_TEST_PREFIX || 'PWTEST').trim(),
  backendDir: path.resolve(FRONTEND_ROOT, process.env.PW_BACKEND_DIR || '../backend'),
  startFrontend: envBoolean('PW_START_FRONTEND', true),
  startBackend: envBoolean('PW_START_BACKEND', true),
  allowMutations: envBoolean('PW_ALLOW_MUTATIONS', true),
  localOnly: envBoolean('PW_LOCAL_ONLY', true),
});

const AUTH_FILE = path.join(FRONTEND_ROOT, 'tests', '.auth', 'user.json');

function unique(label = '') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const suffix = String(label || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${env.prefix}${suffix}${stamp}`.slice(0, 95);
}

function assertCredentialsConfigured() {
  if (!env.adminUser || !env.adminPassword) {
    throw new Error('Faltan PW_ADMIN_USER o PW_ADMIN_PASSWORD en .env.test.');
  }
  if (Boolean(env.vistaUser) !== Boolean(env.vistaPassword)) {
    throw new Error('PW_VISTA_USER y PW_VISTA_PASSWORD deben configurarse juntos o dejarse ambos vacíos.');
  }
}

function urlHost(value, label) {
  try {
    return new URL(value).hostname;
  } catch (_error) {
    throw new Error(`${label} no es una URL válida: ${value}`);
  }
}

function assertSafeMutationConfiguration() {
  if (!env.allowMutations) {
    throw new Error('Las pruebas que crean/editan/eliminan datos requieren PW_ALLOW_MUTATIONS=1.');
  }
  if (!env.localOnly) {
    throw new Error('LERNA está configurado para testing local estricto: PW_LOCAL_ONLY debe ser 1.');
  }
  if (!localHost(urlHost(env.baseURL, 'PW_BASE_URL'))) {
    throw new Error(`BLOQUEADO: PW_BASE_URL debe apuntar a localhost/127.0.0.1 (${env.baseURL}).`);
  }
  if (!localHost(urlHost(env.apiURL, 'PW_API_URL'))) {
    throw new Error(`BLOQUEADO: PW_API_URL debe apuntar a localhost/127.0.0.1 (${env.apiURL}).`);
  }
  if (!Number.isInteger(env.tenantId) || env.tenantId <= 0) {
    throw new Error(`PW_TENANT_ID inválido: ${env.tenantId}`);
  }
  if (!env.expectedTenantId) {
    throw new Error('Definí PW_EXPECTED_TENANT_ID para impedir pruebas sobre un tenant equivocado.');
  }
  if (!fs.existsSync(env.backendDir)) {
    throw new Error(`PW_BACKEND_DIR no existe: ${env.backendDir}`);
  }
  if (env.prefix.length < 4) {
    throw new Error('PW_TEST_PREFIX debe tener al menos 4 caracteres.');
  }
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-AR');
}

function tenantInfoFromAuth(auth) {
  const usuario = auth?.usuario || {};
  const tenant = auth?.tenant || usuario?.tenant || {};
  const actualId = String(
    tenant?.idTenant ?? tenant?.id_tenant ?? usuario?.idTenant ?? usuario?.id_tenant ?? usuario?.tenant_id ?? ''
  ).trim();
  const actualName = String(
    tenant?.nombre ?? tenant?.tenant_nombre ?? usuario?.tenant_nombre ?? usuario?.nombre_tenant ?? ''
  ).trim();
  return { actualId, actualName, usuario, tenant };
}

function assertExpectedTenantAuth(auth) {
  const info = tenantInfoFromAuth(auth);
  if (env.expectedTenantId && info.actualId !== env.expectedTenantId) {
    throw new Error(`BLOQUEADO: sesión tenant ${info.actualId || '(sin id)'}; se esperaba ${env.expectedTenantId}.`);
  }
  if (env.expectedTenantName && normalizeText(info.actualName) !== normalizeText(env.expectedTenantName)) {
    throw new Error(`BLOQUEADO: sesión tenant "${info.actualName || '(sin nombre)'}"; se esperaba "${env.expectedTenantName}".`);
  }
  return info;
}

function tenantFromStorageState(state) {
  let preferredOrigin = '';
  try { preferredOrigin = new URL(env.baseURL).origin; } catch (_error) {}
  const origins = [...(state?.origins || [])].sort((a, b) => {
    if (a.origin === preferredOrigin) return -1;
    if (b.origin === preferredOrigin) return 1;
    return 0;
  });

  for (const origin of origins) {
    const map = Object.fromEntries((origin.localStorage || []).map((entry) => [entry.name, entry.value]));
    let usuario = null;
    let tenant = null;
    try { usuario = map.usuario ? JSON.parse(map.usuario) : null; } catch (_error) {}
    try { tenant = map.tenant ? JSON.parse(map.tenant) : null; } catch (_error) {}
    if (!usuario && !tenant) continue;
    return { ...tenantInfoFromAuth({ usuario, tenant }), origin: origin.origin };
  }
  return { actualId: '', actualName: '', usuario: null, tenant: null, origin: '' };
}

async function assertExpectedTenant(page) {
  const state = await page.context().storageState();
  const info = tenantFromStorageState(state);
  if (!info.usuario && !info.tenant) {
    throw new Error('No se pudo verificar el tenant: no existe usuario/tenant en el localStorage autenticado.');
  }
  if (env.expectedTenantId && info.actualId !== env.expectedTenantId) {
    throw new Error(`BLOQUEADO: sesión tenant ${info.actualId || '(sin id)'}; se esperaba ${env.expectedTenantId}.`);
  }
  if (env.expectedTenantName && normalizeText(info.actualName) !== normalizeText(env.expectedTenantName)) {
    throw new Error(`BLOQUEADO: sesión tenant "${info.actualName || '(sin nombre)'}"; se esperaba "${env.expectedTenantName}".`);
  }
  return info;
}

module.exports = {
  AUTH_FILE,
  env,
  envBoolean,
  loadTestEnv,
  unique,
  assertCredentialsConfigured,
  assertSafeMutationConfiguration,
  assertExpectedTenant,
  assertExpectedTenantAuth,
  tenantFromStorageState,
};
