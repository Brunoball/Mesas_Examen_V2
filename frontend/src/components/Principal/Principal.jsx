// src/components/Principal/Principal.jsx
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSignOutAlt,
  faLayerGroup,
  faBookOpen,
  faChalkboardTeacher,
  faUserTie,
  faBars,
  faXmark,
  faGraduationCap,
  faUserCircle,
  faGear,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import logoLernaBlanco from "../../imagenes/lerna_blancov3.png";
import Dashbord from "../Dashbord/Dashbord";

export const MesasShellContext = createContext(false);

/* =========================================================
   Modal cierre de sesión
========================================================= */
const ConfirmLogoutModal = memo(function ConfirmLogoutModal({
  open,
  onClose,
  onConfirm,
  loading = false,
}) {
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
      className="pp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pp-modal-title"
      onMouseDown={onClose}
    >
      <div className="pp-modal" onMouseDown={stop}>
        <div className="pp-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="pp-modal-title" className="pp-modal__title">
          Confirmar cierre de sesión
        </h3>

        <p className="pp-modal__text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="pp-modal__actions">
          <button
            type="button"
            className="pp-btn pp-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="pp-btn pp-btn--danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Cerrando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
});

/* =========================================================
   Configuración de navegación
========================================================= */
const NAV_ITEMS = [
  {
    key: "dashbord",
    label: "Dashboard",
    icon: faChartLine,
    ruta: "/panel",
    description: "Vista general de previas, mesas, grupos y pendientes.",
  },
  {
    key: "mesas",
    label: "Mesas",
    icon: faLayerGroup,
    ruta: "/mesas-examen",
    description: "Crear, consultar, agrupar y exportar mesas.",
  },
  {
    key: "previas",
    label: "Previas",
    icon: faGraduationCap,
    ruta: "/previas",
    description: "Cargar, editar, dar de baja y administrar previas.",
  },
  {
    key: "materias",
    label: "Materias",
    icon: faBookOpen,
    ruta: "/materias",
    description: "Gestionar materias, áreas, correlativas y talleres.",
    children: [
      {
        key: "materias-areas",
        label: "Áreas",
        ruta: "/materias?seccion=areas",
        seccion: "areas",
      },
      {
        key: "materias-correlativas",
        label: "Correlativas",
        ruta: "/materias?seccion=correlativas",
        seccion: "correlativas",
      },
      {
        key: "materias-talleres",
        label: "Talleres",
        ruta: "/materias?seccion=talleres",
        seccion: "talleres",
      },
    ],
  },
  {
    key: "catedras",
    label: "Cátedras",
    icon: faChalkboardTeacher,
    ruta: "/catedras",
    description: "Consultar curso, división, materia y asignar docentes.",
  },
  {
    key: "docentes",
    label: "Docentes",
    icon: faUserTie,
    ruta: "/docentes",
    description: "Gestionar altas, bajas, datos e indisponibilidad.",
  },
];

/* =========================================================
   Outlet memoizado
========================================================= */
const StableOutlet = memo(function StableOutlet() {
  return <Outlet />;
});

/* =========================================================
   Principal
========================================================= */
const Principal = ({ children = null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [closingUI, setClosingUI] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSubmenuKey, setOpenSubmenuKey] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("usuario");
      const u = raw ? JSON.parse(raw) : null;
      setUsuario(u);
    } catch {
      setUsuario(null);
    }

    // Mesas queda fijo en modo claro. No se porta la lógica de modo oscuro de Balto.
    document.documentElement.setAttribute("data-theme", "claro");
    document.body?.classList?.remove("dark");
    localStorage.removeItem("tema_mesas");
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.classList.add("pp-lockScroll");
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("pp-lockScroll");
    };
  }, [drawerOpen]);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const materiaSubseccionActiva = searchParams.get("seccion") || "materias";

  const activeKey = useMemo(() => {
    if (
      location.pathname === "/panel" ||
      location.pathname === "/dashbord" ||
      location.pathname === "/dashboard"
    ) {
      return "dashbord";
    }

    if (
      location.pathname === "/configuracion" ||
      location.pathname.startsWith("/configuracion/") ||
      location.pathname === "/configuracion-formulario" ||
      location.pathname.startsWith("/configuracion-formulario/")
    ) {
      return "configuracion";
    }

    const found = NAV_ITEMS.find((item) => {
      if (item.key === "materias") {
        return location.pathname === item.ruta || location.pathname.startsWith("/materias/");
      }

      return (
        location.pathname === item.ruta ||
        location.pathname.startsWith(`${item.ruta}/`)
      );
    });

    return found?.key || "";
  }, [location.pathname]);

  const activeLabel = useMemo(() => {
    if (activeKey === "configuracion") return "Configuración";

    const found = NAV_ITEMS.find((item) => item.key === activeKey);
    return found?.label || "Panel";
  }, [activeKey]);

  useEffect(() => {
    const activeItem = NAV_ITEMS.find((item) => item.key === activeKey);
    if (activeItem?.children?.length) {
      setOpenSubmenuKey(activeItem.key);
    }
  }, [activeKey]);

  const hasChildren = React.Children.count(children) > 0;

  const esPanelInicio = useMemo(() => {
    const path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/panel" || path === "/dashbord" || path === "/dashboard";
  }, [location.pathname]);

  const handleNavigate = useCallback(
    (ruta) => {
      navigate(ruta);
      setDrawerOpen(false);
    },
    [navigate]
  );

  const handleLogoClick = useCallback(() => {
    handleNavigate("/panel");
  }, [handleNavigate]);

  const toggleSubmenu = useCallback((itemKey) => {
    setOpenSubmenuKey((prev) => (prev === itemKey ? "" : itemKey));
  }, []);

  const confirmarCierreSesion = useCallback(() => {
    setClosingUI(true);
    setIsExiting(true);

    setTimeout(() => {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      setShowLogoutModal(false);
      navigate("/", { replace: true });
    }, 350);
  }, [navigate]);

  return (
    <MesasShellContext.Provider value={true}>
      <div className={`pp-shell ${isExiting ? "pp-shell--exiting" : ""}`}>
        <header className="mov-topbar">
          <div className="mov-topbar__left">
            <button
              className="pp-burger"
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
              title="Menú"
            >
              <FontAwesomeIcon icon={faBars} />
            </button>



            <div className="mov-topbar__logo mov-topbar__lernaBrand" aria-label="Logo Lerna">
              <img
                src={logoLernaBlanco}
                alt="Logo Lerna"
                className="mov-topbar__lernaLogo"
              />
            </div>
          </div>

          <div className="mov-topbar__right">
            <div className="mov-topbar__section">{activeLabel}</div>

            <div
              className="mov-topbar__usericon"
              title={usuario?.Nombre_Completo || usuario?.nombre || "Usuario"}
              aria-label="Usuario"
            >
              <FontAwesomeIcon icon={faUserCircle} />
            </div>

            <button
              className={`pp-topbarConfig ${activeKey === "configuracion" ? "is-active" : ""}`}
              type="button"
              onClick={() => handleNavigate("/configuracion")}
              title="Configuración"
              aria-label="Ir a Configuración"
            >
              <FontAwesomeIcon icon={faGear} />
            </button>

            <button
              className="pp-topbarLogout"
              type="button"
              onClick={() => setShowLogoutModal(true)}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <FontAwesomeIcon icon={faSignOutAlt} />
            </button>
          </div>
        </header>

        <div
          className={`pp-drawerOverlay ${drawerOpen ? "is-open" : ""}`}
          onMouseDown={() => setDrawerOpen(false)}
        />

        <aside className={`pp-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
          <div className="pp-drawerHeader">
            <div
              className="pp-drawerBrand"
              onClick={handleLogoClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleLogoClick();
              }}
            >
              <div className="pp-drawerBrand__mark">
                <FontAwesomeIcon icon={faChartLine} />
              </div>

              <div className="pp-drawerBrand__txt">
                <div className="pp-drawerBrand__t">Sistema Académico</div>
                <div className="pp-drawerBrand__s">Panel principal</div>
              </div>
            </div>

            <button
              className="pp-drawerClose"
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Cerrar menú"
              title="Cerrar"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div
            className="pp-brand panel_contable"
            onClick={handleLogoClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleLogoClick();
            }}
          >
            <div className="pp-brand__mark">
              <FontAwesomeIcon icon={faChartLine} />
            </div>

            <div className="pp-brand__text">
              <div className="pp-brand__title">Sistema Académico</div>
              <div className="pp-brand__subtitle">Panel principal</div>
            </div>
          </div>

          <nav className="pp-nav" aria-label="Navegación principal">
            {NAV_ITEMS.map((item) => {
              const hasSub = Array.isArray(item.children) && item.children.length > 0;
              const isActive = activeKey === item.key;
              const isOpen = openSubmenuKey === item.key;

              return (
                <div
                  key={item.key}
                  className={`pp-navGroup ${hasSub ? "has-sub" : ""} ${
                    isOpen ? "is-open" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`pp-nav__item ${isActive ? "is-active" : ""}`}
                    onClick={() => {
                      if (hasSub) {
                        toggleSubmenu(item.key);
                        return;
                      }

                      handleNavigate(item.ruta);
                    }}
                    onDoubleClick={() => {
                      if (hasSub) handleNavigate(item.ruta);
                    }}
                    title={item.description || item.label}
                    aria-expanded={hasSub ? isOpen : undefined}
                    aria-haspopup={hasSub ? "menu" : undefined}
                  >
                    <span className="pp-nav__icon">
                      <FontAwesomeIcon icon={item.icon} />
                    </span>

                    <span className="pp-nav__label">{item.label}</span>
                  </button>

                  {hasSub && (
                    <div className="pp-navSub" aria-label={`Subsecciones de ${item.label}`}>
                      {item.children.map((subitem) => {
                        const isSubActive =
                          isActive && materiaSubseccionActiva === subitem.seccion;

                        return (
                          <button
                            key={subitem.key}
                            type="button"
                            className={`pp-navSub__item ${isSubActive ? "is-active" : ""}`}
                            onClick={() => handleNavigate(subitem.ruta)}
                            title={subitem.label}
                          >
                            <span className="pp-navSub__dot" aria-hidden="true" />
                            <span className="pp-navSub__label">{subitem.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>


        </aside>

        <main className="pp-content">
          <div className="pp-content__inner">
            {hasChildren ? children : esPanelInicio ? <Dashbord /> : <StableOutlet />}
          </div>
        </main>

        <ConfirmLogoutModal
          open={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onConfirm={confirmarCierreSesion}
          loading={closingUI}
        />
      </div>
    </MesasShellContext.Provider>
  );
};

export default Principal;
