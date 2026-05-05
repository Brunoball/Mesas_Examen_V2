// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";
import Principal from "./components/Principal/Principal";
import DisponibilidadDocentes from "./components/DisponibilidadDocentes/DisponibilidadDocentes";

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

function DisponibilidadConShell() {
  return (
    <Principal>
      <DisponibilidadDocentes />
    </Principal>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        <Route
          path="/panel"
          element={
            <RutaProtegida>
              <DisponibilidadConShell />
            </RutaProtegida>
          }
        />

        <Route
          path="/disponibilidad-docentes"
          element={
            <RutaProtegida>
              <DisponibilidadConShell />
            </RutaProtegida>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
