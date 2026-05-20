// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

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
import ConfiguracionFormulario from "./components/ConfiguracionFormulario/ConfiguracionFormulario";

function isAuthenticated() {
  try {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("usuario");

    let usuarioOk = false;

    if (rawUser) {
      try {
        JSON.parse(rawUser);
        usuarioOk = true;
      } catch {
        usuarioOk = false;
      }
    }

    return !!token || usuarioOk;
  } catch {
    return false;
  }
}

function RutaProtegida({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

export default function App() {
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
          path="/configuracion"
          element={
            <RutaProtegida>
              <Principal>
                <Configuracion />
              </Principal>
            </RutaProtegida>
          }
        />

        <Route
          path="/configuracion-formulario"
          element={
            <RutaProtegida>
              <Principal>
                <ConfiguracionFormulario />
              </Principal>
            </RutaProtegida>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
