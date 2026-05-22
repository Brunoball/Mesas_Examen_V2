import BASE_URL from '../../../config/config';

const PUBLIC_ACTIONS = new Set([
  'inicio',
  'auth_csrf_token',
  'recuperar_contrasena_solicitar',
  'recuperar_contrasena_validar',
  'recuperar_contrasena_guardar',
  'form_obtener_config_inscripcion',
  'form_buscar_previas',
  'form_registrar_inscripcion',
  'obtener_config_inscripcion',
  'buscar_previas',
  'registrar_inscripcion',
  'formulario_obtener_config_inscripcion',
  'formulario_buscar_previas',
  'formulario_registrar_inscripcion',
]);

const AUTH_LAST_ACTIVITY_KEY = 'auth_last_activity';
const SESSION_EXPIRED_REASON_KEY = 'session_expired_reason';

const AUTH_LOCAL_STORAGE_KEYS = [
  'token',
  'session_key',
  'sessionKey',
  'auth_token',
  'csrf_token',
  'usuario',
  'tenant',
  'idTenant',
];

const AUTH_SESSION_STORAGE_KEYS = [
  'token',
  'session_key',
  'sessionKey',
  'auth_token',
  'csrf_token',
];

function normalizarAction(action) {
  return String(action || '').trim();
}

function esAccionPublica(action) {
  return PUBLIC_ACTIONS.has(normalizarAction(action));
}

function getAuthToken() {
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('session_key') ||
    localStorage.getItem('sessionKey') ||
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('auth_token') ||
    sessionStorage.getItem('session_key') ||
    sessionStorage.getItem('sessionKey') ||
    sessionStorage.getItem('token') ||
    ''
  );
}

function getCsrfToken() {
  return (
    document.querySelector('meta[name="csrf-token"]')?.content ||
    sessionStorage.getItem('csrf_token') ||
    localStorage.getItem('csrf_token') ||
    ''
  );
}

function limpiarSesionLocal() {
  try {
    AUTH_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
    localStorage.setItem(SESSION_EXPIRED_REASON_KEY, '1');
  } catch {
    // No se bloquea el cierre de sesión si el storage falla.
  }

  try {
    AUTH_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // No se bloquea el cierre de sesión si el storage falla.
  }
}

function notificarSesionExpirada() {
  limpiarSesionLocal();

  try {
    window.dispatchEvent(new CustomEvent('lerna:session-expired'));
  } catch {
    // Compatibilidad con navegadores viejos.
  }

  const path = String(window.location.pathname || '/');
  const estaEnLogin = path === '/' || path === '/recuperar-contrasena' || path === '/restablecer-contrasena';

  if (!estaEnLogin) {
    window.location.replace('/');
  }
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

function buildHeaders(action, extraHeaders = {}, options = {}) {
  const token = esAccionPublica(action) ? '' : getAuthToken();
  const hasBody = Boolean(options.hasBody);

  return {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function agregarCsrfEnBody(action, method, payload) {
  const metodo = String(method || 'GET').toUpperCase();

  if (metodo === 'GET' || esAccionPublica(action)) {
    return payload || {};
  }

  const csrf = getCsrfToken();

  if (!csrf || payload instanceof FormData) {
    return payload || {};
  }

  return {
    ...(payload || {}),
    csrf_token: csrf,
  };
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return `${BASE_URL}/api.php?${qs}`;
}

async function handleResponse(action, res) {
  const data = await leerJsonSeguro(res);

  if (!res.ok) {
    if (res.status === 401 && !esAccionPublica(action)) {
      notificarSesionExpirada();
    }

    throw crearErrorApi(action, res, data);
  }

  return data;
}

export async function apiGet(action, params = {}) {
  const res = await fetch(buildUrl(action, params), {
    method: 'GET',
    credentials: 'include',
    headers: buildHeaders(action),
  });

  return handleResponse(action, res);
}

export async function apiPost(action, payload = {}, params = {}) {
  const bodyPayload = agregarCsrfEnBody(action, 'POST', payload);

  const res = await fetch(buildUrl(action, params), {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders(action, {}, { hasBody: true }),
    body: JSON.stringify(bodyPayload || {}),
  });

  return handleResponse(action, res);
}

export async function apiRequest(action, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const params = options.params || {};
  const payload = options.payload || {};
  const hasBody = method !== 'GET';
  const bodyPayload = hasBody ? agregarCsrfEnBody(action, method, payload) : null;

  const res = await fetch(buildUrl(action, params), {
    method,
    credentials: 'include',
    headers: buildHeaders(action, options.headers || {}, { hasBody }),
    ...(hasBody ? { body: JSON.stringify(bodyPayload || {}) } : {}),
  });

  return handleResponse(action, res);
}
