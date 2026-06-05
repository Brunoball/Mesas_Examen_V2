// src/components/Formulario/Formulario.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import "./Formulario.css";
import Toast from "../global/Toast";
import BASE_URL from "../../config/config";

const API_BASE = String(BASE_URL || "").replace(/\/+$/, "");

const obtenerTenantIdExplicito = () => {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const desdeUrl =
      params.get("idTenant") ||
      params.get("id_tenant") ||
      params.get("tenant_id") ||
      params.get("tenantId") ||
      "";

    if (/^\d+$/.test(String(desdeUrl).trim())) {
      return String(desdeUrl).trim();
    }

    const posiblesClaves = [
      "idTenant",
      "id_tenant",
      "tenant_id",
      "tenantId",
      "lerna_tenant_id",
      "tenant_actual",
    ];

    for (const key of posiblesClaves) {
      const value = localStorage.getItem(key);
      if (/^\d+$/.test(String(value || "").trim())) {
        return String(value).trim();
      }
    }
  } catch {
    // Sin window/localStorage o con almacenamiento bloqueado: se resuelve por host en backend.
  }

  return "";
};

const apiUrl = (action) => {
  const base = API_BASE.endsWith("/api.php") ? API_BASE : `${API_BASE}/api.php`;
  const params = new URLSearchParams({ action });
  const idTenant = obtenerTenantIdExplicito();

  if (idTenant) {
    params.set("idTenant", idTenant);
  }

  return `${base}?${params.toString()}`;
};

const conTenantEnBody = (payload = {}) => {
  const idTenant = obtenerTenantIdExplicito();
  return idTenant ? { ...payload, idTenant: Number(idTenant) } : payload;
};

const getApiOrigin = () => {
  try {
    const base = API_BASE.endsWith("/api.php") ? API_BASE : `${API_BASE}/api.php`;
    return new URL(base, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

const resolverAssetUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";

  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  const clean = value.replace(/^\.\/+/, "").replace(/^\/html\//, "/");
  const path = clean.startsWith("/") ? clean : `/${clean}`;

  // Cuando el front corre local pero apunta al backend de Hostinger,
  // /uploads/... no puede resolverse contra localhost:3000.
  // Siempre lo convertimos al origen real del backend configurado en BASE_URL.
  return `${getApiOrigin()}${path}`;
};

const normalizarColor = (color, fallback = "#c6171d") => {
  const value = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex) => {
  const clean = normalizarColor(hex).replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

const ajustarColor = (hex, amount) => {
  const rgb = hexToRgb(hex);
  return rgbToHex({
    r: rgb.r + amount,
    g: rgb.g + amount,
    b: rgb.b + amount,
  });
};

const generarTemaFormulario = (cfg) => {
  const primary = normalizarColor(cfg?.color_principal || cfg?.colorPrincipal);
  const fondo = resolverAssetUrl(
    cfg?.fondo_url_absoluta ||
      cfg?.fondoUrlAbsoluta ||
      cfg?.fondoUrlAbsolute ||
      cfg?.fondo_url ||
      cfg?.fondoUrl
  );

  return {
    "--reg-primary": primary,
    "--reg-primary-light": ajustarColor(primary, 38),
    "--reg-primary-dark": ajustarColor(primary, -48),
    "--reg-accent": primary,
    ...(fondo ? { "--form-bg-image": `url("${fondo}")` } : {}),
  };
};

const obtenerLogoFormulario = (cfg) =>
  resolverAssetUrl(
    cfg?.logo_url_absoluta ||
      cfg?.logoUrlAbsoluta ||
      cfg?.logoUrlAbsolute ||
      cfg?.logo_url ||
      cfg?.logoUrl ||
      ""
  );

const LogoFormulario = ({ src, className = "hero-logo", alt = "Logo de la escuela" }) => {
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        // Si la URL guardada en la base es inválida, no mostramos un logo fijo.
        // Así queda claro que hay que cargar/corregir el logo desde el panel interno.
        e.currentTarget.style.display = "none";
      }}
    />
  );
};

const obtenerTituloFormulario = (cfg) =>
  String(cfg?.titulo || cfg?.nombre || "Mesas de Examen").trim() || "Mesas de Examen";

/* ======== Claves de localStorage ======== */
const LS = {
  REMEMBER: "form_previas_recordarme",
  GMAIL: "form_previas_gmail",
  DNI: "form_previas_dni",
};

/* ======== Util: fecha/hora linda en ES ======== */
const fmtFechaHoraES = (iso) => {
  try {
    if (!iso) return "-";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso || "-";
  }
};

/* =========================================================
   Hook ventana de inscripción con REFRESCO EN TIEMPO REAL
   ========================================================= */
const useVentanaInscripcion = (pollMs = 10000) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const prevAbiertaRef = useRef(null);

  const fetchVentana = useCallback(async () => {
    try {
      setError("");
      const resp = await fetch(
        `${apiUrl("form_obtener_config_inscripcion")}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await resp.json();

      if (!json.exito) {
        setError(json.mensaje || "No se pudo obtener la configuración.");
        setData((old) => (old ? { ...old, abierta: false } : null));
      } else {
        setData(json);
      }

      return json;
    } catch (e) {
      setError("Error de red al consultar la configuración.");
      return { exito: false, abierta: false };
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    fetchVentana();
  }, [fetchVentana]);

  useEffect(() => {
    const id = setInterval(fetchVentana, pollMs);
    return () => clearInterval(id);
  }, [fetchVentana, pollMs]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") fetchVentana();
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchVentana]);

  useEffect(() => {
    if (data?.abierta !== undefined && prevAbiertaRef.current !== null) {
      if (prevAbiertaRef.current !== data.abierta) {
        const ev = new CustomEvent("ventana:cambio", {
          detail: { abierta: data.abierta, data },
        });
        window.dispatchEvent(ev);
      }
    }

    if (data?.abierta !== undefined) {
      prevAbiertaRef.current = data.abierta;
    }
  }, [data]);

  return { cargando, error, data, refetch: fetchVentana };
};

/* ================== Pantalla fuera de término ================== */
const InscripcionCerrada = ({ cfg }) => {
  const titulo = obtenerTituloFormulario(cfg);
  const msg = cfg?.mensaje_cerrado || "Inscripción cerrada / fuera de término.";
  const logo = obtenerLogoFormulario(cfg);
  const tema = generarTemaFormulario(cfg);

  return (
    <div className="auth-page is-login-screen" style={tema}>
      <div className="auth-card">
        <aside className="auth-hero is-login">
          <div className="hero-inner">
            <div className="her-container">
              <h1 className="hero-title">{titulo}</h1>
              <p className="hero-sub">Inscripción en línea</p>
            </div>

            <LogoFormulario src={logo} className="hero-logo hero-logo--big" />
          </div>
        </aside>

        <section className="auth-body">
          <header className="auth-header">
            <h2 className="auth-title">Inscripción no disponible</h2>
            <p className="auth-sub">{msg}</p>
          </header>

          {cfg?.inicio && cfg?.fin && (
            <div className="closed-box">
              <p>
                <strong>Ventana de inscripción:</strong>
              </p>
              <ul className="closed-list">
                <li>
                  <strong>Desde:</strong> {fmtFechaHoraES(cfg.inicio)}
                </li>
                <li>
                  <strong>Hasta:</strong> {fmtFechaHoraES(cfg.fin)}
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* ============== Subvista: Resumen Alumno ============== */
const ResumenAlumno = ({
  data,
  onVolver,
  onConfirmar,
  ventana,
  configVisual,
  onVentanaCerro,
}) => {
  const logo = obtenerLogoFormulario(configVisual || ventana);

  // Materias inscribibles (cond=3)
  const materiasCond3 = data?.alumno?.materias ?? [];

  // Materias "Tercera materia" (cond=5) — solo visualización
  const materiasCond5 = data?.alumno?.materias_cond5 ?? [];

  // Materias "pendientes" (cond=6) — solo visualización
  const materiasCond6 = data?.alumno?.materias_cond6 ?? [];

  // Grupos correlativos detectados en el backend
  const correlativas = data?.alumno?.correlativas ?? [];

  // Todas empiezan deseleccionadas
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [inscribiendo, setInscribiendo] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSeleccion(new Set());
  }, [materiasCond3.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        onVentanaCerro?.();
      }
    };

    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [onVentanaCerro]);

  // Generar clave única para cada materia
  const generarClaveUnica = (materia) => {
    if (materia?.clave_unica) return materia.clave_unica;
    return `${materia.id_materia}_${materia.curso_id}_${materia.division_id}`;
  };

  const mapaMateriasPorClave = useMemo(() => {
    const map = new Map();

    materiasCond3.forEach((m) => {
      map.set(generarClaveUnica(m), m);
    });

    return map;
  }, [materiasCond3]);

  /* =========================================================
     ORDEN CORRECTO:
     Primero menor año/curso arriba.
     Ejemplo:
     MATEMÁTICA 5° arriba
     ANÁLISIS MATEMÁTICO 6° abajo
     ========================================================= */
  const obtenerNumeroCurso = (materia) => {
    const directo = Number(materia?.curso_id);

    if (!Number.isNaN(directo) && directo > 0) {
      return directo;
    }

    const desdeTexto = String(materia?.curso || "").match(/\d+/);
    return desdeTexto ? Number(desdeTexto[0]) : 999;
  };

  const obtenerNumeroDivision = (materia) => {
    const directo = Number(materia?.division_id);

    if (!Number.isNaN(directo) && directo > 0) {
      return directo;
    }

    return 999;
  };

  const ordenarMateriasPorAnio = (lista) => {
    return [...lista].sort((a, b) => {
      const cursoA = obtenerNumeroCurso(a);
      const cursoB = obtenerNumeroCurso(b);

      if (cursoA !== cursoB) {
        return cursoA - cursoB;
      }

      const divisionA = obtenerNumeroDivision(a);
      const divisionB = obtenerNumeroDivision(b);

      if (divisionA !== divisionB) {
        return divisionA - divisionB;
      }

      return String(a.materia || "").localeCompare(
        String(b.materia || ""),
        "es",
        {
          sensitivity: "base",
        }
      );
    });
  };

  const materiasOrdenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond3),
    [materiasCond3]
  );

  const materias5Ordenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond5),
    [materiasCond5]
  );

  const materias6Ordenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond6),
    [materiasCond6]
  );

  /*
    NUEVO:
    El cartel amarillo solo aparece si hay correlativas
    y al menos una de esas materias NO está inscripta.
    Si todas ya están INSCRIPTO, se oculta.
  */
  const mostrarAvisoCorrelativas = useMemo(() => {
    if (!Array.isArray(correlativas) || correlativas.length === 0) {
      return false;
    }

    return correlativas.some((grupo) => {
      const materiasGrupo = Array.isArray(grupo?.materias)
        ? grupo.materias
        : [];

      return materiasGrupo.some((m) => !Number(m?.inscripcion));
    });
  }, [correlativas]);

  const materiaEstaDisponiblePorCorrelativa = useCallback(
    (materia, seleccionActual = seleccion) => {
      const anteriores = Array.isArray(materia?.correlativas_anteriores)
        ? materia.correlativas_anteriores
        : [];

      if (anteriores.length === 0) {
        return true;
      }

      // La posterior solo se habilita si todas las anteriores están seleccionadas
      // o ya estaban inscriptas.
      return anteriores.every((claveAnterior) => {
        const anterior = mapaMateriasPorClave.get(claveAnterior);

        if (!anterior) return false;

        const anteriorYaInscripta = !!Number(anterior.inscripcion);
        const anteriorSeleccionada = seleccionActual.has(claveAnterior);

        return anteriorYaInscripta || anteriorSeleccionada;
      });
    },
    [seleccion, mapaMateriasPorClave]
  );

  const obtenerMensajeBloqueoCorrelativa = (materia) => {
    const anteriores = Array.isArray(materia?.correlativas_anteriores)
      ? materia.correlativas_anteriores
      : [];

    if (anteriores.length === 0) return "";

    const nombresPendientes = anteriores
      .map((clave) => mapaMateriasPorClave.get(clave))
      .filter(
        (m) =>
          m &&
          !Number(m.inscripcion) &&
          !seleccion.has(generarClaveUnica(m))
      )
      .map((m) => m.materia);

    if (nombresPendientes.length === 0) return "";

    return `Primero seleccioná: ${nombresPendientes.join(", ")}`;
  };

  const quitarPosterioresDependientes = useCallback(
    (claveQuitada, seleccionBase) => {
      const next = new Set(seleccionBase);

      let huboCambios = true;

      while (huboCambios) {
        huboCambios = false;

        materiasCond3.forEach((m) => {
          const claveM = generarClaveUnica(m);

          if (!next.has(claveM)) return;

          const disponible = materiaEstaDisponiblePorCorrelativa(m, next);

          if (!disponible) {
            next.delete(claveM);
            huboCambios = true;
          }
        });
      }

      next.delete(claveQuitada);

      return next;
    },
    [materiasCond3, materiaEstaDisponiblePorCorrelativa]
  );

  const toggle = (materia, disabled) => {
    if (disabled) return;

    const claveUnica = generarClaveUnica(materia);

    setSeleccion((prev) => {
      const next = new Set(prev);

      if (next.has(claveUnica)) {
        next.delete(claveUnica);

        // Si saco la anterior, saco automáticamente las posteriores
        // que dependían de esa selección.
        return quitarPosterioresDependientes(claveUnica, next);
      }

      // Si intenta seleccionar una posterior sin la anterior, no dejamos.
      if (!materiaEstaDisponiblePorCorrelativa(materia, next)) {
        return next;
      }

      next.add(claveUnica);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (inscribiendo) return;

    const elegidas = materiasOrdenadas.filter((m) => {
      const claveUnica = generarClaveUnica(m);
      return !Number(m.inscripcion) && seleccion.has(claveUnica);
    });

    // Seguridad extra en frontend:
    // si por cualquier motivo quedó seleccionada una posterior sin anterior, bloqueamos.
    const invalida = elegidas.find((m) => {
      const anteriores = Array.isArray(m?.correlativas_anteriores)
        ? m.correlativas_anteriores
        : [];

      if (anteriores.length === 0) return false;

      return !anteriores.every((claveAnterior) => {
        const anterior = mapaMateriasPorClave.get(claveAnterior);

        if (!anterior) return false;

        return !!Number(anterior.inscripcion) || seleccion.has(claveAnterior);
      });
    });

    if (invalida) {
      alert(
        `No podés inscribirte solo en "${invalida.materia}". Primero tenés que seleccionar la correlativa anterior.`
      );
      return;
    }

    setInscribiendo(true);

    try {
      await onConfirmar({
        dni: data.alumno.dni,
        gmail: data.gmail ?? "",
        nombre_alumno: data.alumno?.nombre ?? "",
        materias: elegidas.map((m) => ({
          id_previa: m.id_previa,
          id_materia: m.id_materia,
          curso_id: m.curso_id,
          division_id: m.division_id,
          materia: m.materia || "",
          curso: m.curso || "",
          division: m.division || "",
        })),
        materias_nombres: elegidas.map((m) => m.materia || ""),
      });
    } finally {
      if (mountedRef.current) {
        setInscribiendo(false);
      }
    }
  };

  const a = data.alumno;
  const abierta = !!ventana?.abierta;

  const handleKeyToggle = (e, materia, disabled) => {
    if (disabled) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(materia, false);
    }
  };

  return (
    <div className="auth-card">
      {/* Caja izquierda */}
      <aside className="auth-hero">
        <div className="hero-scroll">
          <div className="hero-inner">
            <div className="hero-top">
              <LogoFormulario src={logo} className="hero-logo" />
              <h1 className="hero-title">¡Bienvenido!</h1>
              <p className="hero-sub">Revisá tus datos de inscripción.</p>
            </div>

            <div
              className="hero-form"
              aria-label="Datos del alumno (solo lectura)"
            >
              <label className="hf-field">
                <span className="hf-label">Nombre y Apellido</span>
                <input className="hf-input" value={a?.nombre ?? ""} readOnly />
              </label>

              <label className="hf-field">
                <span className="hf-label">DNI</span>
                <input className="hf-input" value={a?.dni ?? ""} readOnly />
              </label>

              <div className="hf-row-3">
                <label className="hf-field">
                  <span className="hf-label">Año actual</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.anio_actual ?? ""}
                    readOnly
                  />
                </label>

                <label className="hf-field">
                  <span className="hf-label">Curso</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.curso ?? ""}
                    readOnly
                  />
                </label>

                <label className="hf-field">
                  <span className="hf-label">División</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.division ?? ""}
                    readOnly
                  />
                </label>
              </div>

              <label className="hf-field">
                <span className="hf-label">Gmail</span>
                <input
                  className="hf-input"
                  value={data?.gmail ?? ""}
                  readOnly
                />
              </label>

              <div className="hf-hint">
                Estos datos no se pueden modificar aquí.
              </div>
            </div>

            <div className="actions-left only-desktop">
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={onVolver}
                disabled={inscribiendo}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Caja derecha */}
      <section className="auth-body">
        <header className="auth-header">
          <h2 className="auth-title">Materias pendientes de rendir</h2>
          <p className="auth-sub">
            Estas son tus materias previas (adeudadas).
          </p>

          {ventana && (
            <div
              className={`ventana-pill ${abierta ? "is-open" : "is-closed"}`}
            >
              {abierta ? (
                <>
                  Inscripción abierta hasta{" "}
                  <strong className="fecha-cierre">
                    {fmtFechaHoraES(ventana.fin)}
                  </strong>
                  .
                </>
              ) : (
                <>
                  Inscripción cerrada (desde {fmtFechaHoraES(ventana.inicio)}{" "}
                  hasta {fmtFechaHoraES(ventana.fin)}).
                </>
              )}
            </div>
          )}

          {mostrarAvisoCorrelativas && (
            <div className="form-alert form-alert--warning">
              Materias correlativas: primero seleccioná la anterior para poder
              inscribirte a la posterior.
            </div>
          )}
        </header>

        {/* Grid cond=3 */}
        <div className="materias-scroll">
          <div className="materias-grid">
            {materiasOrdenadas.map((m) => {
              const claveUnica = generarClaveUnica(m);
              const yaInscripto = !!Number(m.inscripcion);
              const selected = seleccion.has(claveUnica);

              const bloqueadaPorCorrelativa =
                !yaInscripto && !materiaEstaDisponiblePorCorrelativa(m);

              const disabled =
                yaInscripto || !abierta || bloqueadaPorCorrelativa || inscribiendo;

              const classes = [
                "materia-card",
                yaInscripto ? "inscripto" : selected ? "selected" : "",
                !abierta || bloqueadaPorCorrelativa ? "disabled" : "",
                m.es_correlativa ? "es-correlativa" : "",
                "clickable",
              ]
                .join(" ")
                .trim();

              const mensajeBloqueo = obtenerMensajeBloqueoCorrelativa(m);

              const title = yaInscripto
                ? "Ya estás inscripto en esta materia"
                : inscribiendo
                ? "Inscripción en proceso"
                : !abierta
                ? "La inscripción está cerrada"
                : bloqueadaPorCorrelativa
                ? mensajeBloqueo ||
                  "Primero seleccioná la correlativa anterior"
                : "Click para seleccionar/deseleccionar";

              return (
                <div
                  key={claveUnica}
                  className={classes}
                  title={title}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-pressed={selected}
                  onClick={() => !disabled && toggle(m, false)}
                  onKeyDown={(e) => handleKeyToggle(e, m, disabled)}
                  style={
                    bloqueadaPorCorrelativa
                      ? {
                          opacity: 0.55,
                          cursor: "not-allowed",
                        }
                      : undefined
                  }
                >
                  <span className="nombre">
                    {m.materia}

                    {yaInscripto && (
                      <span className="badge-inscripto">INSCRIPTO</span>
                    )}

                    {m.es_correlativa && !yaInscripto && (
                      <span className="badge-correlativa">
                        CORRELATIVA
                      </span>
                    )}
                  </span>

                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>

                  {bloqueadaPorCorrelativa && (
                    <small className="materia-lock-hint">
                      {mensajeBloqueo || "Primero seleccioná la anterior"}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Materias pendientes cond=6 */}
        {materias6Ordenadas.length > 0 && (
          <div className="materias-pendientes-section">
            <h3 className="auth-title">Materias pendientes</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>

            <div className="materias-grid">
              {materias6Ordenadas.map((m) => (
                <div
                  key={`c6-${generarClaveUnica(m)}`}
                  className="materia-card disabled only-visual"
                  title="Materia pendiente (no inscribible en esta instancia)"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tercera materia cond=5 */}
        {materias5Ordenadas.length > 0 && (
          <div className="tercera-materia-section">
            <h3 className="auth-title">Tercera materia</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>

            <div className="materias-grid">
              {materias5Ordenadas.map((m) => (
                <div
                  key={`c5-${generarClaveUnica(m)}`}
                  className="materia-card disabled only-visual"
                  title="Tercera materia: solo visualización"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="actions-right only-desktop">
          <button
            type="button"
            className={`btn-primary ${inscribiendo ? "is-loading" : ""}`}
            onClick={handleConfirm}
            disabled={!abierta || inscribiendo}
            title={!abierta ? "La inscripción está cerrada" : ""}
            aria-busy={inscribiendo}
          >
            {inscribiendo && (
              <span className="btn-loading-spinner" aria-hidden="true" />
            )}
            {inscribiendo ? "Inscribiendo..." : "Confirmar inscripción"}
          </button>
        </div>
      </section>

      <nav className="nav-bar only-mobile">
        <button
          type="button"
          className="btn-light"
          onClick={onVolver}
          disabled={inscribiendo}
        >
          Volver
        </button>

        <button
          type="button"
          className={`btn-primary ${inscribiendo ? "is-loading" : ""}`}
          onClick={handleConfirm}
          disabled={!abierta || inscribiendo}
          title={!abierta ? "La inscripción está cerrada" : ""}
          aria-busy={inscribiendo}
        >
          {inscribiendo && (
            <span className="btn-loading-spinner" aria-hidden="true" />
          )}
          {inscribiendo ? "Inscribiendo..." : "Confirmar inscripción"}
        </button>
      </nav>
    </div>
  );
};

/* ============== Formulario principal ============== */
const Formulario = () => {
  const {
    cargando: cargandoVentana,
    error: errorVentana,
    data: ventana,
    refetch: refetchVentana,
  } = useVentanaInscripcion(10000);

  const [gmail, setGmail] = useState("");
  const [dni, setDni] = useState("");
  const [remember, setRemember] = useState(false);

  const [toast, setToast] = useState(null);

  const showToastReplace = useCallback((tipo, mensaje, duracion = 3800) => {
    setToast(null);

    setTimeout(() => {
      setToast({ tipo, mensaje, duracion, key: Date.now() });
    }, 0);
  }, []);

  const [cargando, setCargando] = useState(false);
  const [dataAlumno, setDataAlumno] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        showToastReplace(
          "advertencia",
          ventana?.mensaje_cerrado || "La inscripción se cerró."
        );
      } else if (e?.detail?.abierta === true) {
        showToastReplace("exito", "La inscripción se abrió.");
      }
    };

    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [showToastReplace, ventana?.mensaje_cerrado]);

  const isValidGmail = useCallback(
    (v) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(v.trim()),
    []
  );

  const isValidDni = useCallback((v) => /^[0-9]{7,9}$/.test(v), []);

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem(LS.REMEMBER) === "1";

      if (savedRemember) {
        const savedGmail = localStorage.getItem(LS.GMAIL) || "";
        const savedDni = localStorage.getItem(LS.DNI) || "";

        setRemember(true);

        if (savedGmail) setGmail(savedGmail);
        if (savedDni) setDni(savedDni);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (remember) {
      try {
        localStorage.setItem(LS.GMAIL, gmail || "");
      } catch {}
    }
  }, [gmail, remember]);

  useEffect(() => {
    if (remember) {
      try {
        localStorage.setItem(LS.DNI, dni || "");
      } catch {}
    }
  }, [dni, remember]);

  const onToggleRemember = (e) => {
    const checked = e.target.checked;
    setRemember(checked);

    try {
      if (checked) {
        localStorage.setItem(LS.REMEMBER, "1");
        localStorage.setItem(LS.GMAIL, gmail || "");
        localStorage.setItem(LS.DNI, dni || "");
      } else {
        localStorage.removeItem(LS.REMEMBER);
        localStorage.removeItem(LS.GMAIL);
        localStorage.removeItem(LS.DNI);
      }
    } catch {}
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const cfgActual = await refetchVentana();

    if (cfgActual && cfgActual.hay_config !== false && !cfgActual.abierta) {
      showToastReplace(
        "advertencia",
        cfgActual.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }

    if (!isValidGmail(gmail)) {
      showToastReplace("error", "Ingresá un Gmail válido (@gmail.com).");
      return;
    }

    if (!isValidDni(dni)) {
      showToastReplace("error", "Ingresá un DNI válido (7 a 9 dígitos).");
      return;
    }

    try {
      setCargando(true);

      const resp = await fetch(
        apiUrl("form_buscar_previas"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(conTenantEnBody({ gmail: gmail.trim(), dni })),
        }
      );

      const json = await resp.json();

      if (!json.exito) {
        const mensajeServidor =
          typeof json.mensaje === "string" ? json.mensaje.trim() : "";
        const mensajeFallback = "No se encontraron previas para el DNI.";
        const mensajeMostrar = mensajeServidor || mensajeFallback;

        const esNoPrevias =
          /no se encontraron.*(materias\s*previas|previas).*(dni)/i.test(
            mensajeMostrar
          );

        showToastReplace(
          "advertencia",
          mensajeMostrar,
          esNoPrevias ? 3000 : 3800
        );
        return;
      }

      if (json.ya_inscripto) {
        showToastReplace(
          "advertencia",
          "El alumno ya fue inscrito en todas las materias adeudadas."
        );
      }

      setDataAlumno({ ...json, gmail: gmail.trim() });
    } catch (err) {
      showToastReplace("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  const confirmarInscripcion = async ({
    dni,
    materias,
    materias_nombres,
    gmail,
    nombre_alumno,
  }) => {
    if (!materias?.length) {
      showToastReplace("advertencia", "Seleccioná al menos una materia.");
      return;
    }

    const cfgActual = await refetchVentana();

    if (cfgActual && cfgActual.hay_config !== false && !cfgActual.abierta) {
      showToastReplace(
        "advertencia",
        cfgActual.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }

    try {
      const resp = await fetch(
        apiUrl("form_registrar_inscripcion"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(conTenantEnBody({
            dni,
            gmail,
            nombre_alumno,
            materias,
            materias_nombres,
          })),
        }
      );

      const json = await resp.json();

      if (!json.exito) {
        showToastReplace(
          "error",
          json?.mensaje || "No se pudo registrar la inscripción."
        );
        return;
      }

      const insertados = Number(json.insertados || 0);
      const duracionExito = insertados === 1 ? 3000 : 3800;

      showToastReplace(
        "exito",
        json?.mensaje ||
          cfgActual?.mensaje_confirmacion ||
          ventana?.mensaje_confirmacion ||
          `Inscripción registrada (${insertados} materia/s).`,
        duracionExito
      );

      setDataAlumno(null);

      if (!remember) {
        setDni("");
        setGmail("");
      }
    } catch {
      showToastReplace("error", "Error de red al registrar la inscripción.");
    }
  };

  if (cargandoVentana) {
    return (
      <div className="auth-page">
        <div className="loading-center">
          <div className="spinner" aria-label="Cargando configuración..." />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (errorVentana) {
    return (
      <InscripcionCerrada
        cfg={{
          mensaje_cerrado: "Inscripción no disponible por el momento.",
        }}
      />
    );
  }

  if (ventana && !ventana.abierta) {
    return <InscripcionCerrada cfg={ventana} />;
  }

  const isLoginScreen = !dataAlumno;
  const temaFormulario = generarTemaFormulario(ventana);
  const logoFormulario = obtenerLogoFormulario(ventana);
  const tituloFormulario = obtenerTituloFormulario(ventana);
  const textoBienvenida =
    String(ventana?.mensaje_bienvenida || "").trim() ||
    "Ingresá tu Gmail y DNI para consultar e inscribirte.";

  return (
    <div
      className={`auth-page ${isLoginScreen ? "is-login-screen" : ""}`}
      style={temaFormulario}
    >
      {toast && (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      {dataAlumno ? (
        <ResumenAlumno
          data={dataAlumno}
          onVolver={() => setDataAlumno(null)}
          onConfirmar={confirmarInscripcion}
          ventana={ventana}
          configVisual={ventana}
          onVentanaCerro={() => {
            setDataAlumno(null);
          }}
        />
      ) : (
        <div className="auth-card">
          <aside className="auth-hero is-login">
            <div className="hero-inner">
              <div className="her-container">
                <h1 className="hero-title">{tituloFormulario}</h1>
                <p className="hero-sub">{textoBienvenida}</p>
              </div>

              <LogoFormulario
                src={logoFormulario}
                className="hero-logo hero-logo--big"
              />
            </div>
          </aside>

          <section className="auth-body">
            <header className="auth-header">
              <h2 className="auth-title">Iniciar sesión</h2>
              <p className="auth-sub">
                Inscripción abierta hasta{" "}
                <strong className="fecha-cierre">
                  {fmtFechaHoraES(ventana?.fin)}
                </strong>
                .
              </p>

              <p className="form-alert form-alert--danger">
                Si sos egresado, acercate a secretaría para realizar la
                inscripción.
              </p>
            </header>

            <form
              className="auth-form"
              onSubmit={onSubmit}
              noValidate
              id="login-form"
            >
              <label className="field">
                <span className="field-label">Gmail</span>
                <input
                  className="field-input"
                  id="gmail"
                  type="email"
                  inputMode="email"
                  placeholder="tuusuario@gmail.com"
                  value={gmail}
                  onChange={(e) => setGmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label className="field">
                <span className="field-label">DNI</span>
                <input
                  className="field-input"
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  placeholder="Solo números"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D+/g, ""))}
                  required
                  autoComplete="off"
                />
              </label>

              <div className="form-extra">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={onToggleRemember}
                  />{" "}
                  <span>Recordarme</span>
                </label>
              </div>

              <button
                type="submit"
                className="btn-cta only-desktop"
                disabled={cargando}
              >
                {cargando ? "Buscando..." : "Continuar"}
              </button>
            </form>
          </section>

          <nav className="nav-login-mobile only-mobile">
            <button
              type="submit"
              form="login-form"
              className="btn-cta"
              disabled={cargando}
            >
              {cargando ? "Buscando..." : "Continuar"}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default Formulario;