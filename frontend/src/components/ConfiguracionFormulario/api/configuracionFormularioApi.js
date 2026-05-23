// src/components/ConfiguracionFormulario/api/configuracionFormularioApi.js
import BASE_URL from "../../../config/config.jsx";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

function buildHeaders(json = false) {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();

  const headers = json ? { "Content-Type": "application/json" } : {};

  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

function getMessage(payload, fallback) {
  return (
    payload?.mensaje ||
    payload?.message ||
    payload?.error ||
    payload?.detalle ||
    fallback
  );
}

function buildUrl(action, params = {}) {
  const sp = new URLSearchParams();
  sp.set("action", action);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  });

  return `${API_URL}?${sp.toString()}`;
}

async function parseResponse(res) {
  const text = await res.text();

  if (res.status === 401 || res.status === 403) {
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } catch {
      // Si CustomEvent no está disponible, no rompemos la sección.
    }
  }

  if (!text) {
    if (!res.ok) throw new Error(`HTTP ${res.status}: respuesta vacía del servidor.`);
    return {};
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const preview = text.length > 260 ? `${text.slice(0, 260)}...` : text;
    throw new Error(
      text.trim().startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend o la sesión."
        : `Respuesta inválida del servidor. HTTP ${res.status}. ${preview}`
    );
  }

  if (!res.ok || payload?.exito === false || payload?.ok === false || payload?.success === false) {
    throw new Error(getMessage(payload, `HTTP ${res.status}: no se pudo completar la operación.`));
  }

  return payload;
}

async function apiGet(action, params = {}) {
  const res = await fetch(buildUrl(action, params), {
    method: "GET",
    headers: buildHeaders(false),
  });

  return parseResponse(res);
}

async function apiPost(action, payload = {}) {
  const res = await fetch(buildUrl(action), {
    method: "POST",
    headers: buildHeaders(true),
    body: JSON.stringify(payload || {}),
  });

  return parseResponse(res);
}

export const configuracionFormularioApi = {
  obtener: () => apiGet("form_obtener_config_inscripcion"),
  guardar: (payload) => apiPost("form_guardar_config_inscripcion", payload),
};

export const obtenerConfiguracionFormulario = configuracionFormularioApi.obtener;
export const guardarConfiguracionFormulario = configuracionFormularioApi.guardar;
