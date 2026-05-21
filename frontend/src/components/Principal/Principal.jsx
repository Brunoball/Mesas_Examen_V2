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
import BASE_URL from "../../config/config";

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
   Logo del tenant / cliente
========================================================= */
const parseStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const LERNA_PROD_ORIGIN = "https://lerna.3devsnet.com";

const esHostLocal = () => {
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
};

const esUrlLocal = (url) => {
  const value = String(url || "").trim().toLowerCase();

  if (!value) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  } catch {
    return (
      value.includes("localhost") ||
      value.includes("127.0.0.1") ||
      value.includes("0.0.0.0")
    );
  }
};

const normalizarApiRoutesUrl = (url) => {
  let value = String(url || "").trim();

  if (!value) return "";

  value = value.replace(/\/+$/, "");

  // Si el config tiene .../routes, lo convertimos al archivo real de la API.
  if (/\/routes$/i.test(value)) return `${value}/api.php`;

  return value;
};

const obtenerOrigenDesdeUrl = (url) => {
  const value = String(url || "").trim();

  if (!value) return "";

  try {
    return new URL(value, window.location.origin).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const resolverApiPrincipalUrl = () => {
  // Usa SIEMPRE el config real del proyecto:
  // frontend/src/components/config/config.jsx
  //
  // Si BASE_URL apunta a Hostinger, aunque el frontend corra en localhost,
  // la consulta del usuario/logo se hace contra Hostinger.
  // Si BASE_URL apunta a localhost, no se pide el logo para no generar errores.
  const configUrl = String(BASE_URL || "").trim();

  if (configUrl) return normalizarApiRoutesUrl(configUrl);

  const envUrl = String(
    process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || ""
  ).trim();

  if (envUrl) return normalizarApiRoutesUrl(envUrl);

  if (esHostLocal()) {
    return "http://localhost:3001/routes/api.php";
  }

  return `${String(window.location.origin || LERNA_PROD_ORIGIN).replace(/\/+$/, "")}/api/routes/api.php`;
};

const resolverPublicBaseUrl = () => {
  const publicEnvUrl = String(
    process.env.REACT_APP_PUBLIC_BASE_URL ||
      process.env.REACT_APP_APP_URL ||
      ""
  ).trim();

  if (publicEnvUrl) return publicEnvUrl.replace(/\/+$/, "");

  // Importante: para logos guardados como /uploads/tenants/..., usamos el
  // origen del BASE_URL configurado. Así si el front está local pero BASE_URL
  // apunta a Hostinger, la imagen se arma como:
  // https://lerna.3devsnet.com/uploads/tenants/t_1/logos/Escudo.png
  const configOrigin = obtenerOrigenDesdeUrl(BASE_URL);

  if (configOrigin) return configOrigin;

  return String(window.location.origin || LERNA_PROD_ORIGIN).replace(/\/+$/, "");
};

const normalizarLogoTenantUrl = (url) => {
  const value = String(url || "").trim();

  if (
    !value ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined" ||
    value === "-"
  ) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  const clean = value.replace(/\\/g, "/");
  const publicBase = resolverPublicBaseUrl();

  return clean.startsWith("/") ? `${publicBase}${clean}` : `${publicBase}/${clean}`;
};

const extraerLogoTenant = (usuario) => {
  const candidatos = [
    usuario?.logo_icono_url,
    usuario?.logo_url,
    usuario?.tenant_logo_icono_url,
    usuario?.tenant_logo_url,
    usuario?.tenant?.logo_icono_url,
    usuario?.tenant?.logo_url,
  ];

  const elegido = candidatos.find((item) => String(item || "").trim() !== "");
  return normalizarLogoTenantUrl(elegido);
};

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
  const [logoTenantError, setLogoTenantError] = useState(false);

  const apiPrincipalUrl = useMemo(() => resolverApiPrincipalUrl(), []);
  const apiPrincipalEsLocal = useMemo(() => esUrlLocal(apiPrincipalUrl), [apiPrincipalUrl]);

  const logoTenantUrl = useMemo(() => {
    // Si la API configurada apunta a localhost, no se pide ni se muestra el logo.
    // En local normalmente /uploads/... no existe y no conviene consultar Hostinger.
    if (apiPrincipalEsLocal) return "";
    return extraerLogoTenant(usuario);
  }, [usuario, apiPrincipalEsLocal]);

  useEffect(() => {
    setLogoTenantError(false);
  }, [logoTenantUrl]);

  useEffect(() => {
    // Mesas queda fijo en modo claro. No se porta la lógica de modo oscuro de Balto.
    document.documentElement.setAttribute("data-theme", "claro");
    document.body?.classList?.remove("dark");
    localStorage.removeItem("tema_mesas");

    const usuarioGuardado = parseStoredJson("usuario");
    const tenantGuardado = parseStoredJson("tenant");

    const usuarioInicial = usuarioGuardado
      ? {
          ...usuarioGuardado,
          tenant: usuarioGuardado.tenant || tenantGuardado || null,
        }
      : null;

    setUsuario(usuarioInicial);

    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("session_key") ||
      localStorage.getItem("sessionKey") ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("session_key") ||
      sessionStorage.getItem("sessionKey") ||
      "";

    if (!token) return undefined;

    // Si el sistema está configurado contra backend local, no intentamos consultar
    // auth_usuario_actual ni pedir logo de tenant. Así no aparece ERR_CONNECTION_REFUSED
    // cuando el PHP local no está levantado.
    if (apiPrincipalEsLocal) return undefined;

    const controller = new AbortController();
    const apiUrl = apiPrincipalUrl;
    const separator = apiUrl.includes("?") ? "&" : "?";

    fetch(`${apiUrl}${separator}action=auth_usuario_actual`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Session": token,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.exito || !data?.usuario) return;

        const usuarioActualizado = {
          ...data.usuario,
          tenant: data.usuario.tenant || data.tenant || tenantGuardado || null,
        };

        setUsuario(usuarioActualizado);
        localStorage.setItem("usuario", JSON.stringify(usuarioActualizado));

        if (usuarioActualizado.tenant) {
          localStorage.setItem("tenant", JSON.stringify(usuarioActualizado.tenant));
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          // Si falla la actualización, se mantiene el usuario ya guardado localmente.
        }
      });

    return () => controller.abort();
  }, [apiPrincipalEsLocal, apiPrincipalUrl]);

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
              className={`mov-topbar__usericon ${logoTenantUrl && !logoTenantError ? "has-logo" : ""}`}
              title={usuario?.tenant?.nombre || usuario?.tenant_nombre || usuario?.Nombre_Completo || usuario?.nombre || "Usuario"}
              aria-label="Usuario"
            >
              {logoTenantUrl && !logoTenantError ? (
                <img
                  src={logoTenantUrl}
                  alt={usuario?.tenant?.nombre || usuario?.tenant_nombre || "Logo institucional"}
                  className="mov-topbar__userlogo"
                  loading="eager"
                  onError={() => setLogoTenantError(true)}
                />
              ) : (
                <FontAwesomeIcon icon={faUserCircle} />
              )}
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
