import BASE_URL from '../../../config/config';

function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('auth_token') || '';
}

function getCsrfToken() {
  return (
    document.querySelector('meta[name="csrf-token"]')?.content ||
    sessionStorage.getItem('csrf_token') ||
    localStorage.getItem('csrf_token') ||
    ''
  );
}

async function leerJsonSeguro(res) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`La API no devolvió JSON válido. Respuesta: ${text.slice(0, 250)}`);
  }
}

function crearErrorApi(action, res, data) {
  const mensaje = data?.mensaje || `Error HTTP ${res.status}`;
  const error = new Error(`[${action}] ${mensaje}`);
  error.status = res.status;
  error.data = data;
  return error;
}

function buildHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  const csrf = getCsrfToken();

  return {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Auth-Token': token } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...extraHeaders,
  };
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return `${BASE_URL}/api.php?${qs}`;
}

async function handleResponse(action, res) {
  const data = await leerJsonSeguro(res);

  if (!res.ok) {
    throw crearErrorApi(action, res, data);
  }

  return data;
}

export async function apiGet(action, params = {}) {
  const res = await fetch(buildUrl(action, params), {
    method: 'GET',
    credentials: 'include',
    headers: buildHeaders(),
  });

  return handleResponse(action, res);
}

export async function apiPost(action, payload = {}, params = {}) {
  const res = await fetch(buildUrl(action, params), {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders(),
    body: JSON.stringify(payload || {}),
  });

  return handleResponse(action, res);
}

export async function apiRequest(action, options = {}) {
  const method = options.method || 'GET';
  const params = options.params || {};
  const payload = options.payload || {};

  const res = await fetch(buildUrl(action, params), {
    method,
    credentials: 'include',
    headers: buildHeaders(options.headers || {}),
    ...(method !== 'GET' ? { body: JSON.stringify(payload || {}) } : {}),
  });

  return handleResponse(action, res);
}
