const { expect } = require('@playwright/test');
const { env } = require('./env.helper');

function endpoint(action, params = {}) {
  const url = new URL(`${env.apiURL}/api.php`);
  url.searchParams.set('action', action);
  url.searchParams.set('idTenant', String(env.tenantId));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function call(request, action, options = {}) {
  const method = String(options.method || (options.data === undefined ? 'GET' : 'POST')).toUpperCase();
  const auth = options.auth || null;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'LernaPlaywright/PWFORM',
    ...(options.headers || {}),
  };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  let data = options.data;
  if (method !== 'GET' && auth?.csrfToken && data && typeof data === 'object') {
    data = { ...data, csrf_token: auth.csrfToken };
  }
  const response = await request.fetch(endpoint(action, options.params), {
    method,
    headers,
    data: method === 'GET' ? undefined : (data || {}),
    failOnStatusCode: false,
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { exito: false, mensaje: text || 'Respuesta no JSON' }; }
  return { status: response.status(), data: payload, text };
}

const get = (request, action, params = {}, auth = null) => call(request, action, { method: 'GET', params, auth });
const post = (request, action, data = {}, auth = null) => call(request, action, { method: 'POST', data, auth });

async function login(request) {
  const result = await post(request, 'inicio', { nombre: env.adminUser, contrasena: env.adminPassword });
  expect(result.status, result.text).toBe(200);
  expect(result.data?.exito, result.data?.mensaje || result.text).toBe(true);
  return {
    token: result.data.token || result.data.session_key,
    csrfToken: result.data.csrf_token,
    usuario: result.data.usuario || {},
    tenant: result.data.tenant || result.data.usuario?.tenant || {},
  };
}

function expectOk(result, context) {
  expect(result.status, `${context}: ${result.text}`).toBeGreaterThanOrEqual(200);
  expect(result.status, `${context}: ${result.text}`).toBeLessThan(300);
  expect(result.data?.exito, `${context}: ${result.data?.mensaje || result.text}`).toBe(true);
  return result.data;
}

function expectFail(result, statuses, pattern, context) {
  expect(result.data?.exito, `${context}: se esperaba exito=false. ${result.text}`).toBe(false);
  if (statuses) expect(Array.isArray(statuses) ? statuses : [statuses]).toContain(result.status);
  if (pattern) expect(String(result.data?.mensaje || ''), context).toMatch(pattern);
  return result.data;
}

module.exports = { endpoint, call, get, post, login, expectOk, expectFail };
