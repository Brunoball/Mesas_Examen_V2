// src/components/Mesas_examen/api/mesasExamenApi.js

const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3001/routes/api.php";

let csrfTokenCache = null;

const buildUrl = (action, params = {}) => {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
};

const obtenerCsrfToken = async () => {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await fetch(buildUrl("auth_csrf_token"), {
    method: "GET",
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.exito) {
    throw new Error(data.mensaje || "No se pudo obtener el token CSRF.");
  }

  csrfTokenCache = data.csrf_token;
  return csrfTokenCache;
};

const request = async (action, { method = "GET", params = {}, body = null } = {}) => {
  const upperMethod = method.toUpperCase();
  const headers = {
    Accept: "application/json",
  };

  const options = {
    method: upperMethod,
    headers,
    credentials: "include",
  };

  if (upperMethod !== "GET") {
    const csrfToken = await obtenerCsrfToken();

    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrfToken;
    headers["X-Requested-With"] = "XMLHttpRequest";

    options.body = JSON.stringify({
      action,
      ...(body || {}),
    });
  }

  const response = await fetch(buildUrl(action, params), options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.exito === false) {
    throw new Error(data.mensaje || "Error al comunicarse con el servidor.");
  }

  return data;
};

export const listarMesasExamen = ({ pagina = 1, porPagina = 100, busqueda = "" } = {}) => {
  return request("mesas_examen_listar", {
    method: "GET",
    params: {
      pagina,
      por_pagina: porPagina,
      busqueda,
    },
  });
};

export const obtenerParametrosArmadoMesas = () => {
  return request("mesas_armado_parametros", {
    method: "GET",
  });
};

export const crearArmadoInicialMesas = ({
  fecha_inicio,
  fecha_fin,
  limpiar_borrador = true,
  excluir_fines_semana = true,
}) => {
  return request("mesas_armado_crear", {
    method: "POST",
    body: {
      fecha_inicio,
      fecha_fin,
      limpiar_borrador,
      excluir_fines_semana,
    },
  });
};

export const eliminarBorradorMesas = () => {
  return request("mesas_armado_eliminar_borrador", {
    method: "POST",
    body: {},
  });
};
