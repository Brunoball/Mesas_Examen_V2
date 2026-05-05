import React, { useEffect, useState } from "react";
import "./Toast.css";

const ICONOS = {
  exito: "✔",
  error: "✕",
  advertencia: "⚠",
  cargando: "⟳",
  info: "ℹ",
};

const CLASES_TIPO = {
  exito: "toast-exito",
  error: "toast-error",
  advertencia: "toast-advertencia",
  cargando: "toast-cargando",
  info: "toast-info",
};

const Toast = ({ tipo = "info", mensaje, onClose, duracion = 3800 }) => {
  const [desapareciendo, setDesapareciendo] = useState(false);

  useEffect(() => {
    const mostrarTimer = setTimeout(() => {
      setDesapareciendo(true);
    }, Math.max(0, duracion - 500));

    const ocultarTimer = setTimeout(() => {
      onClose?.();
    }, duracion);

    return () => {
      clearTimeout(mostrarTimer);
      clearTimeout(ocultarTimer);
    };
  }, [onClose, duracion]);

  const claseSeleccionada = CLASES_TIPO[tipo] || CLASES_TIPO.info;
  const iconoSeleccionado = ICONOS[tipo] || ICONOS.info;

  return (
    <div
      className={`toast-container ${claseSeleccionada} ${
        desapareciendo ? "desaparecer" : ""
      }`}
    >
      <span className={`toast-icon ${tipo === "cargando" ? "spin" : ""}`}>
        {iconoSeleccionado}
      </span>
      <span className="toast-message">{mensaje}</span>
    </div>
  );
};

export default Toast;
