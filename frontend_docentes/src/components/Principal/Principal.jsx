// src/components/Principal/Principal.jsx
import React, { createContext, useEffect, useRef, useState, useCallback, memo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSignOutAlt,
  faCalendarCheck,
  faBars,
  faXmark,
  faGraduationCap,
  faUserCircle,
  faMoon,
  faSun,
  faClipboardList,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import logoRH from "../../imagenes/Escudo.png";

export const MesasShellContext = createContext(false);

const ConfirmLogoutModal = memo(function ConfirmLogoutModal({ open, onClose, onConfirm }) {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="me-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="me-modal-title"
      onMouseDown={onClose}
    >
      <div className="me-modal" onMouseDown={stop}>
        <div className="me-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>
        <h3 id="me-modal-title" className="me-modal__title">
          Confirmar cierre de sesión
        </h3>
        <p className="me-modal__text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>
        <div className="me-modal__actions">
          <button
            type="button"
            className="me-btn me-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="me-btn me-btn--danger"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
});

const NAV_ITEMS = [
  {
    key: "disponibilidad-docentes",
    label: "Disponibilidad Docente",
    icon: faCalendarCheck,
    bottomIcon: faClipboardList,
    ruta: "/disponibilidad-docentes",
    description: "Cargar los días y turnos en los que cada docente puede asistir.",
  },
];

const StableOutlet = memo(function StableOutlet() {
  return <Outlet />;
});

const Principal = ({ children = null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tema, setTema] = useState("claro");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("usuario");
      const u = raw ? JSON.parse(raw) : null;
      setUsuario(u);
    } catch {
      setUsuario(null);
    }

    const temaGuardado = localStorage.getItem("tema_mesas") || "claro";
    setTema(temaGuardado);
    document.documentElement.setAttribute("data-theme", temaGuardado);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.classList.add("me-lockScroll");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("me-lockScroll");
    };
  }, [drawerOpen]);

  const toggleTema = useCallback(() => {
    const nuevo = tema === "claro" ? "oscuro" : "claro";
    setTema(nuevo);
    document.documentElement.setAttribute("data-theme", nuevo);
    localStorage.setItem("tema_mesas", nuevo);
  }, [tema]);

  const handleNavigate = useCallback((ruta) => {
    navigate(ruta);
    setDrawerOpen(false);
  }, [navigate]);

  const confirmarCierreSesion = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      setShowModal(false);
      navigate("/", { replace: true });
    }, 350);
  }, [navigate]);

  const activeKey = NAV_ITEMS.find(
    (item) => location.pathname === item.ruta || location.pathname.startsWith(item.ruta + "/") || location.pathname === "/panel"
  )?.key || "disponibilidad-docentes";

  const activeLabel = NAV_ITEMS.find((item) => item.key === activeKey)?.label || "Panel";
  const hasChildren = React.Children.count(children) > 0;

  return (
    <MesasShellContext.Provider value={true}>
      <div className={`me-shell ${isExiting ? "me-shell--exiting" : ""}`}>
        <header className="me-topbar">
          <div className="me-topbar__left">
            <button
              className="me-burger"
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
            >
              <FontAwesomeIcon icon={faBars} />
            </button>

            <div className="me-topbar__brand">
              <div className="me-topbar__brandMark">
                <FontAwesomeIcon icon={faGraduationCap} />
              </div>
              <div className="me-topbar__brandText">
                <span className="me-topbar__brandName">IPET N° 50</span>
                <span className="me-topbar__brandSub">Disponibilidad Docente</span>
              </div>
            </div>
          </div>

          <div className="me-topbar__right">
            <div className="me-topbar__section">{activeLabel}</div>

            <button
              className="me-topbar__themeBtn"
              onClick={toggleTema}
              title={tema === "claro" ? "Modo oscuro" : "Modo claro"}
              aria-label={tema === "claro" ? "Activar modo oscuro" : "Activar modo claro"}
              type="button"
            >
              <FontAwesomeIcon icon={tema === "claro" ? faMoon : faSun} />
            </button>

            <div className="me-topbar__user" title={usuario?.Nombre_Completo || usuario?.nombre || "Usuario"}>
              <FontAwesomeIcon icon={faUserCircle} />
            </div>

            <button
              className="me-topbar__logoutBtn"
              onClick={() => setShowModal(true)}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              type="button"
            >
              <FontAwesomeIcon icon={faSignOutAlt} />
            </button>
          </div>
        </header>

        <div
          className={`me-drawerOverlay ${drawerOpen ? "is-open" : ""}`}
          onMouseDown={() => setDrawerOpen(false)}
        />

        <aside className={`me-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
          <div className="me-drawerHeader">
            <div className="me-drawerBrand">
              <div className="me-drawerBrand__mark">
                <FontAwesomeIcon icon={faGraduationCap} />
              </div>
              <div className="me-drawerBrand__txt">
                <div className="me-drawerBrand__title">IPET N° 50</div>
                <div className="me-drawerBrand__sub">Disponibilidad Docente</div>
              </div>
            </div>
            <button
              className="me-drawerClose"
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Cerrar menú"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="me-brand">
            <div className="me-brand__mark">
              <img src={logoRH} alt="Logo IPET 50" className="me-brand__logo" />
            </div>
            <div className="me-brand__text">
              <div className="me-brand__title">IPET N° 50</div>
              <div className="me-brand__subtitle">Disponibilidad Docente</div>
            </div>
          </div>

          {usuario?.Nombre_Completo || usuario?.nombre ? (
            <div className="me-sidebarUser">
              <div className="me-sidebarUser__avatar">
                <FontAwesomeIcon icon={faUserCircle} />
              </div>
              <div className="me-sidebarUser__info">
                <span className="me-sidebarUser__name">{usuario?.Nombre_Completo || usuario?.nombre}</span>
                <span className="me-sidebarUser__role">Dirección / Administración</span>
              </div>
            </div>
          ) : null}

          <nav className="me-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <div key={item.key} className={`me-navGroup ${isActive ? "is-active" : ""}`}>
                  <button
                    type="button"
                    className={`me-nav__item ${isActive ? "is-active" : ""}`}
                    onClick={() => handleNavigate(item.ruta)}
                    title={item.label}
                  >
                    <span className="me-nav__icon">
                      <FontAwesomeIcon icon={item.icon} />
                    </span>
                    <span className="me-nav__label">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>

          <div className="me-sidebar__bottom">
            <button
              type="button"
              className="me-sidebarLogout"
              onClick={() => setShowModal(true)}
            >
              <span className="me-sidebarLogout__icon">
                <FontAwesomeIcon icon={faSignOutAlt} />
              </span>
              <span className="me-sidebarLogout__label">Cerrar Sesión</span>
            </button>

            <div className="me-sidebar__footer">
              Desarrollado por{" "}
              <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
                3devs.solutions
              </a>
            </div>
          </div>
        </aside>

        <main className="me-content">
          <div className="me-content__inner">
            {hasChildren ? children : <StableOutlet />}
          </div>
        </main>

        <ConfirmLogoutModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onConfirm={confirmarCierreSesion}
        />
      </div>
    </MesasShellContext.Provider>
  );
};

export default Principal;
