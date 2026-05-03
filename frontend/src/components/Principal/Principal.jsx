// src/components/Principal/Principal.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSignOutAlt,
  faLayerGroup,
  faCalendarDays,
  faBookOpen,
  faProjectDiagram,
  faChalkboardTeacher,
  faUserTie,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import "../Global/roots.css";
import logoRH from "../../imagenes/Escudo.png";

/* =========================================================
   Modal cierre de sesión
========================================================= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    cancelBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="modalprincipal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalprincipal-title"
      onMouseDown={onClose}
    >
      <div
        className="modalprincipal-container modalprincipal--danger"
        onMouseDown={stop}
      >
        <div className="modalprincipal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="modalprincipal-title" className="modalprincipal-title">
          Confirmar cierre de sesión
        </h3>

        <p className="modalprincipal-text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="modalprincipal-buttons">
          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--solid-danger"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   Principal
========================================================= */
const Principal = () => {
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("usuario");
      const u = raw ? JSON.parse(raw) : null;
      setUsuario(u);
    } catch {
      setUsuario(null);
    }
  }, []);

  const abrirMesas = () => {
    navigate("/mesas-examen");
    document.activeElement?.blur?.();
  };

  const abrirMaterias = () => {
    navigate("/materias");
    document.activeElement?.blur?.();
  };

  const abrirCatedras = () => {
    navigate("/catedras");
    document.activeElement?.blur?.();
  };

  const abrirDocentes = () => {
    navigate("/docentes");
    document.activeElement?.blur?.();
  };

  const confirmarCierreSesion = () => {
    setIsExiting(true);

    setTimeout(() => {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      setShowModal(false);
      navigate("/", { replace: true });
    }, 350);
  };

  return (
    <div className={`pagina-principal-container ${isExiting ? "slide-fade-out" : ""}`}>
      <div className="pagina-principal-card">
        <div className="pagina-principal-header header--row">
          <div className="header-text">
            <h1 className="title">
              Sistema de <span className="title-accent">Mesas de Examen</span>
            </h1>

            <p className="subtitle">
              Panel principal para administrar mesas, materias, talleres y correlatividades.
            </p>

            {usuario?.Nombre_Completo && (
              <p className="user-welcome">
                Usuario: <strong>{usuario.Nombre_Completo}</strong>
              </p>
            )}
          </div>

          <div className="logo-container logo-container--right">
            <img src={logoRH} alt="Logo IPET 50" className="logo" />
          </div>
        </div>

        <div className="menu-container">
          <div className="menu-grid menu-grid-dos">
            <button className="menu-button card--compact" onClick={abrirMesas}>
              <div className="button-icon icon--sm">
                <FontAwesomeIcon icon={faLayerGroup} size="lg" />
              </div>

              <span className="button-text text--sm">Mesas de Examen</span>

              <small className="button-description">
                Crear, consultar, agrupar y exportar mesas.
              </small>

              <div className="button-bottom-icon">
                <FontAwesomeIcon icon={faCalendarDays} />
              </div>
            </button>

            <button className="menu-button menu-button-green card--compact" onClick={abrirMaterias}>
              <div className="button-icon icon--sm">
                <FontAwesomeIcon icon={faBookOpen} size="lg" />
              </div>

              <span className="button-text text--sm">Materias</span>

              <small className="button-description">
                Gestionar materias, talleres y correlatividades.
              </small>

              <div className="button-bottom-icon">
                <FontAwesomeIcon icon={faProjectDiagram} />
              </div>
            </button>

            <button className="menu-button card--compact" onClick={abrirCatedras}>
              <div className="button-icon icon--sm">
                <FontAwesomeIcon icon={faChalkboardTeacher} size="lg" />
              </div>

              <span className="button-text text--sm">Cátedras</span>

              <small className="button-description">
                Consultar curso, división, materia y asignar docentes.
              </small>

              <div className="button-bottom-icon">
                <FontAwesomeIcon icon={faChalkboardTeacher} />
              </div>
            </button>

            <button className="menu-button menu-button-green card--compact" onClick={abrirDocentes}>
              <div className="button-icon icon--sm">
                <FontAwesomeIcon icon={faUserTie} size="lg" />
              </div>

              <span className="button-text text--sm">Docentes</span>

              <small className="button-description">
                Gestionar altas, bajas, datos e indisponibilidad.
              </small>

              <div className="button-bottom-icon">
                <FontAwesomeIcon icon={faUserTie} />
              </div>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={() => setShowModal(true)}
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="logout-icon" />
          <span className="logout-text-full">Cerrar Sesión</span>
          <span className="logout-text-short">Salir</span>
        </button>

        <footer className="pagina-principal-footer">
          Desarrollado por{" "}
          <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
            3devs.solutions
          </a>
        </footer>
      </div>

      <ConfirmLogoutModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={confirmarCierreSesion}
      />
    </div>
  );
};

export default Principal;