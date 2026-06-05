// src/App.js
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { apiGet } from "./components/_shared/api/apiClient";

/* Páginas */
import Inicio from "./components/Login/Inicio";
import RestablecerContrasena from "./components/Login/RestablecerContrasena";
import Principal from "./components/Principal/Principal";
import MesasExamen from "./components/Mesas_examen/Mesas_examen";
import Materias from "./components/Materias/Materias";
import Catedras from "./components/Catedras/Catedras";
import Docentes from "./components/Docentes/Docentes";
import Previas from "./components/Previas/Previas.jsx";
import Configuracion from "./components/Configuracion/Configuracion";
import Estadisticas from "./components/Estadisticas/Estadisticas";

const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;
const SESSION_KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const AUTH_LAST_ACTIVITY_KEY = "auth_last_activity";
const SESSION_EXPIRED_REASON_KEY = "session_expired_reason";

const AUTH_LOCAL_STORAGE_KEYS = [
  "token",
  "session_key",
  "sessionKey",
  "auth_token",
  "csrf_token",
  "usuario",
  "tenant",
  "idTenant",
];

const AUTH_SESSION_STORAGE_KEYS = [
  "token",
  "session_key",
  "sessionKey",
  "auth_token",
  "csrf_token",
];

function getAuthToken() {
  try {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("session_key") ||
      localStorage.getItem("sessionKey") ||
      localStorage.getItem("auth_token") ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("session_key") ||
      sessionStorage.getItem("sessionKey") ||
      sessionStorage.getItem("auth_token") ||
      ""
    );
  } catch {
    return "";
  }
}

function limpiarSesionLocal() {
  try {
    AUTH_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
    localStorage.setItem(SESSION_EXPIRED_REASON_KEY, "1");
  } catch {
    // No se bloquea el cierre de sesión si el storage falla.
  }

  try {
    AUTH_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // No se bloquea el cierre de sesión si el storage falla.
  }
}

function redirigirLoginPorSesionExpirada() {
  limpiarSesionLocal();

  const path = String(window.location.pathname || "/");
  const estaEnLogin =
    path === "/" ||
    path === "/recuperar-contrasena" ||
    path === "/restablecer-contrasena";

  if (!estaEnLogin) {
    window.location.replace("/");
  }
}

function obtenerUltimaActividad() {
  try {
    return Number(localStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || "0");
  } catch {
    return 0;
  }
}

function marcarActividadSesion() {
  if (!getAuthToken()) return;

  try {
    localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // Silencioso.
  }
}

function sesionInactivaExpirada() {
  const token = getAuthToken();
  if (!token) return true;

  const ultimaActividad = obtenerUltimaActividad();

  if (!ultimaActividad) {
    marcarActividadSesion();
    return false;
  }

  return Date.now() - ultimaActividad >= SESSION_IDLE_TIMEOUT_MS;
}

function isAuthenticated() {
  try {
    const token = getAuthToken();
    if (!token) return false;

    if (sesionInactivaExpirada()) {
      limpiarSesionLocal();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function RutaProtegida({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

function useControlSesionInactiva() {
  useEffect(() => {
    marcarActividadSesion();

    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "mousedown",
      "touchstart",
      "scroll",
    ];

    const onActivity = () => marcarActividadSesion();
    const onSessionExpired = () => redirigirLoginPorSesionExpirada();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    window.addEventListener("lerna:session-expired", onSessionExpired);

    const checkInterval = window.setInterval(() => {
      if (!getAuthToken()) return;

      if (sesionInactivaExpirada()) {
        redirigirLoginPorSesionExpirada();
      }
    }, SESSION_CHECK_INTERVAL_MS);

    const keepAliveInterval = window.setInterval(() => {
      if (!getAuthToken() || sesionInactivaExpirada()) return;

      apiGet("auth_usuario_actual").catch(() => {
        // Si el backend devuelve 401, apiClient limpia y redirige automáticamente.
      });
    }, SESSION_KEEP_ALIVE_INTERVAL_MS);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });

      window.removeEventListener("lerna:session-expired", onSessionExpired);
      window.clearInterval(checkInterval);
      window.clearInterval(keepAliveInterval);
    };
  }, []);
}

export default function App() {
  useControlSesionInactiva();

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
        <Route path="/recuperar-contrasena" element={<RestablecerContrasena />} />

        <Route
          path="/panel"
          element={
            <RutaProtegida>
              <Principal />
            </RutaProtegida>
          }
        />

        <Route
          path="/mesas-examen"
          element={
            <RutaProtegida>
              <MesasExamen />
            </RutaProtegida>
          }
        />

        <Route
          path="/materias"
          element={
            <RutaProtegida>
              <Materias />
            </RutaProtegida>
          }
        />

        <Route
          path="/catedras"
          element={
            <RutaProtegida>
              <Catedras />
            </RutaProtegida>
          }
        />

        <Route
          path="/docentes"
          element={
            <RutaProtegida>
              <Docentes />
            </RutaProtegida>
          }
        />

        <Route
          path="/previas"
          element={
            <RutaProtegida>
              <Previas />
            </RutaProtegida>
          }
        />

        <Route
          path="/estadisticas"
          element={
            <RutaProtegida>
              <Estadisticas />
            </RutaProtegida>
          }
        />

        <Route
          path="/configuracion"
          element={
            <RutaProtegida>
              <Principal>
                <Configuracion />
              </Principal>
            </RutaProtegida>
          }
        />


        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
