const fs = require('fs');
const { expect } = require('@playwright/test');
const { AUTH_FILE, env } = require('./env.helper');

function endpoint(action, params = {}) {
  const url = new URL(`${env.apiURL}/api.php`);
  url.searchParams.set('action', action);
  if (env.tenantId > 0) url.searchParams.set('id_tenant', String(env.tenantId));
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function readAuthSession() {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(`No existe la sesión de testing: ${AUTH_FILE}`);
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}

function writeAuthSession(auth) {
  fs.mkdirSync(require('path').dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf8');
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    data = { exito: false, mensaje: text || 'Respuesta no JSON' };
  }
  return { response, status: response.status(), data, text };
}

async function apiCall(request, action, options = {}) {
  const method = String(options.method || (options.data !== undefined ? 'POST' : 'GET')).toUpperCase();
  const auth = options.auth || null;
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'LernaPlaywright/PWTEST',
    ...(options.headers || {}),
  };

  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

  let data = options.data;
  if (method !== 'GET' && options.csrf !== false && auth?.csrfToken && data && typeof data === 'object' && !(data instanceof Buffer)) {
    data = { ...data, csrf_token: auth.csrfToken };
  }

  const requestOptions = { headers, failOnStatusCode: false };
  if (method !== 'GET') requestOptions.data = data === undefined ? {} : data;

  const response = await request.fetch(endpoint(action, options.params), {
    method,
    ...requestOptions,
  });
  return parseResponse(response);
}

async function apiGet(request, action, params = {}, auth = null) {
  return apiCall(request, action, { method: 'GET', params, auth });
}

async function apiPost(request, action, data = {}, auth = null, options = {}) {
  return apiCall(request, action, { method: 'POST', data, auth, ...options });
}

async function login(request, user = env.adminUser, password = env.adminPassword) {
  const result = await apiPost(request, 'inicio', { nombre: user, contrasena: password }, null, { csrf: false });
  expect(result.status, `HTTP login: ${result.text}`).toBe(200);
  expect(result.data?.exito, `Login falló: ${result.data?.mensaje || result.text}`).toBe(true);

  const token = result.data.token || result.data.session_key;
  expect(token, 'El login no devolvió token/session_key').toBeTruthy();
  expect(result.data.csrf_token, 'El login no devolvió csrf_token').toBeTruthy();

  return {
    token,
    sessionKey: result.data.session_key || token,
    csrfToken: result.data.csrf_token,
    usuario: result.data.usuario || {},
    tenant: result.data.tenant || result.data.usuario?.tenant || {},
  };
}

function expectOk(result, context = 'API') {
  expect(result.status, `${context} HTTP ${result.status}: ${result.text}`).toBeGreaterThanOrEqual(200);
  expect(result.status, `${context} HTTP ${result.status}: ${result.text}`).toBeLessThan(300);
  expect(result.data?.exito, `${context}: ${result.data?.mensaje || result.text}`).toBe(true);
  return result.data;
}

function expectFail(result, statusOrStatuses = null, messagePattern = null, context = 'API negativa') {
  expect(result.data?.exito, `${context}: se esperaba exito=false. ${result.text}`).toBe(false);
  if (statusOrStatuses != null) {
    const allowed = Array.isArray(statusOrStatuses) ? statusOrStatuses : [statusOrStatuses];
    expect(allowed, `${context}: HTTP inesperado ${result.status}. ${result.text}`).toContain(result.status);
  }
  if (messagePattern) {
    expect(String(result.data?.mensaje || ''), `${context}: mensaje inesperado`).toMatch(messagePattern);
  }
  return result.data;
}

async function listAll(request, action, auth, extraParams = {}, maxPages = 120) {
  const rows = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await apiGet(request, action, { pagina: page, por_pagina: 100, ...extraParams }, auth);
    const data = expectOk(result, `${action} página ${page}`);
    rows.push(...(Array.isArray(data.data) ? data.data : []));
    pages = Number(data?.paginacion?.paginas || data?.paginacion?.total_paginas || 1) || 1;
    page += 1;
  } while (page <= pages && page <= maxPages);
  return rows;
}

module.exports = {
  endpoint,
  apiCall,
  apiGet,
  apiPost,
  login,
  expectOk,
  expectFail,
  listAll,
  readAuthSession,
  writeAuthSession,
};
