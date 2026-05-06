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
  faProjectDiagram,
  faChalkboardTeacher,
  faUserTie,
  faBars,
  faXmark,
  faGraduationCap,
  faUserCircle,
  faClipboardList,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import logoRH from "../../imagenes/Escudo.png";

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
    key: "mesas",
    label: "Mesas de Examen",
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
    key: "configuracion-formulario",
    label: "Config. Formulario",
    icon: faClipboardList,
    ruta: "/configuracion-formulario",
    description: "Definir apertura y cierre del formulario público.",
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

  const handleNavigate = useCallback(
    (ruta) => {
      navigate(ruta);
      setDrawerOpen(false);
    },
    [navigate]
  );

  const handleLogoClick = useCallback(() => {
    handleNavigate("/mesas-examen");
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

            <button
              className="mov-topbar__logo"
              type="button"
              onClick={handleLogoClick}
              title="Ir al panel principal"
            >
              <img
                src={logoRH}
                alt="Logo IPET N° 50"
                className="mov-topbar__logoImg mov-topbar__logoImg--escudo"
              />
            </button>

            <div className="mov-topbar__titles">
              <div className="mov-topbar__sysname">
                <span className="mov-topbar__brandName">IPET N° 50</span>
                <span className="mov-topbar__brandDot">•</span>
                <span className="mov-topbar__brandType">Sistema de Mesas</span>
              </div>

              <div className="mov-topbar__sysby">
                Desarrollado por{" "}
                <a
                  href="https://3devsnet.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mov-topbar__sysbyLink"
                >
                  3 devs
                </a>
              </div>
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
                <FontAwesomeIcon icon={faGraduationCap} />
              </div>

              <div className="pp-drawerBrand__txt">
                <div className="pp-drawerBrand__t">IPET N° 50</div>
                <div className="pp-drawerBrand__s">Mesas de Examen</div>
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
            <div className="pp-brand__mark pp-brand__mark--image">
              <img src={logoRH} alt="Logo IPET N° 50" className="pp-brand__logo" />
            </div>

            <div className="pp-brand__text">
              <div className="pp-brand__title">IPET N° 50</div>
              <div className="pp-brand__subtitle">Mesas de Examen</div>
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

          <div className="pp-sidebar__bottom">
            <button
              type="button"
              className="pp-logout"
              onClick={() => setShowLogoutModal(true)}
              title="Cerrar sesión"
            >
              <span className="pp-logout__icon">
                <FontAwesomeIcon icon={faSignOutAlt} />
              </span>
              <span className="pp-logout__label">Cerrar sesión</span>
            </button>
          </div>
        </aside>

        <main className="pp-content">
          <div className="pp-content__inner">
            {hasChildren ? children : <StableOutlet />}
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
