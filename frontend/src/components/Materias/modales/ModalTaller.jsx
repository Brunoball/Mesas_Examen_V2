// src/components/Materias/modales/ModalTaller.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faFlask,
  faMagnifyingGlass,
  faSave,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "../../Global/Global_css/Global_Modals.css";
import "./ModalTaller.css";

const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const extraerIdsCatedras = (item) => {
  if (!item?.ids_catedras) return [];

  return String(item.ids_catedras)
    .split(",")
    .map((id) => Number(String(id).trim()))
    .filter(Boolean);
};

const extraerDivisionesIniciales = (item) => {
  if (item?.ids_divisiones) {
    const ids = String(item.ids_divisiones)
      .split(",")
      .map((id) => Number(String(id).trim()))
      .filter(Boolean);

    if (ids.length > 0) return ids;
  }

  const idDivision = Number(item?.id_division || 0);
  return idDivision > 0 ? [idDivision] : [];
};

const ModalTaller = ({
  item,
  cursos = [],
  divisiones = [],
  areas = [],
  onObtenerMateriasPorCurso,
  onObtenerCatedrasTaller,
  onClose,
  onSave,
}) => {
  const [taller, setTaller] = useState(item?.taller || "");
  const [idCurso, setIdCurso] = useState(item?.id_curso || "");
  const [idsDivisiones, setIdsDivisiones] = useState(() =>
    extraerDivisionesIniciales(item)
  );
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idArea, setIdArea] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadas, setSeleccionadas] = useState(() =>
    extraerIdsCatedras(item)
  );
  const [catedrasCurso, setCatedrasCurso] = useState([]);
  const [cargandoCatedras, setCargandoCatedras] = useState(false);
  const [errorCatedras, setErrorCatedras] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!guardando) onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [guardando, onClose]);

  useEffect(() => {
    setTaller(item?.taller || "");
    setIdCurso(item?.id_curso || "");
    setIdsDivisiones(extraerDivisionesIniciales(item));
    setActivo(item ? Number(item.activo) === 1 : true);
    setSeleccionadas(extraerIdsCatedras(item));
    setIdArea("");
    setBusqueda("");
  }, [item]);

  useEffect(() => {
    let cancelado = false;

    const cargarCatedras = async () => {
      const id = Number(idCurso || 0);
      const divisionesSeleccionadas = idsDivisiones
        .map(Number)
        .filter((x) => x > 0);

      setErrorCatedras("");

      if (id <= 0 || divisionesSeleccionadas.length === 0) {
        setCatedrasCurso([]);
        return;
      }

      setCargandoCatedras(true);

      try {
        let lista = [];

        if (typeof onObtenerCatedrasTaller === "function") {
          lista = await onObtenerCatedrasTaller(id, divisionesSeleccionadas);
        } else if (typeof onObtenerMateriasPorCurso === "function") {
          const resultados = await Promise.all(
            divisionesSeleccionadas.map((idDivision) =>
              onObtenerMateriasPorCurso(id, { idDivision })
            )
          );
          lista = resultados.flat();
        } else {
          setErrorCatedras(
            "No está configurada la carga de cátedras del taller."
          );
        }

        if (!cancelado) {
          setCatedrasCurso(Array.isArray(lista) ? lista : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelado) {
          setCatedrasCurso([]);
          setErrorCatedras(
            "No se pudieron cargar las cátedras de ese curso y división."
          );
        }
      } finally {
        if (!cancelado) setCargandoCatedras(false);
      }
    };

    cargarCatedras();

    return () => {
      cancelado = true;
    };
  }, [
    idCurso,
    idsDivisiones,
    onObtenerCatedrasTaller,
    onObtenerMateriasPorCurso,
  ]);

  const cursosActivos = useMemo(() => {
    return cursos.filter((c) => Number(c.activo ?? 1) === 1);
  }, [cursos]);

  const divisionesActivas = useMemo(() => {
    return divisiones.filter((d) => Number(d.activo ?? 1) === 1);
  }, [divisiones]);

  const catedrasNormalizadas = useMemo(() => {
    return catedrasCurso
      .map((m) => ({
        ...m,
        id_catedra_num: Number(m.id_catedra || 0),
        id_materia_num: Number(m.id_materia || 0),
        id_division_num: Number(m.id_division || 0),
        activo_num: Number(m.activo ?? 1),
        ids_area_array: String(m.ids_areas || m.id_area || "")
          .split(",")
          .map((x) => Number(String(x).trim()))
          .filter(Boolean),
      }))
      .filter((m) => Number(m.id_catedra_num) > 0);
  }, [catedrasCurso]);

  const catedrasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    const area = Number(idArea || 0);

    return catedrasNormalizadas.filter((m) => {
      if (m.activo_num !== 1) return false;
      if (area > 0 && !m.ids_area_array.includes(area)) return false;
      if (!q) return true;

      return (
        normalizar(m.materia).includes(q) ||
        normalizar(m.areas).includes(q) ||
        normalizar(m.division).includes(q) ||
        normalizar(m.docente).includes(q)
      );
    });
  }, [catedrasNormalizadas, idArea, busqueda]);

  const catedrasAgrupadas = useMemo(() => {
    const grupos = new Map();

    catedrasFiltradas.forEach((cat) => {
      const idDivision = Number(cat.id_division || 0);
      const nombreDivision = cat.division || `División ${idDivision}`;
      const clave = `${idDivision}-${nombreDivision}`;

      if (!grupos.has(clave)) {
        grupos.set(clave, {
          id_division: idDivision,
          division: nombreDivision,
          catedras: [],
        });
      }

      grupos.get(clave).catedras.push(cat);
    });

    return Array.from(grupos.values()).sort(
      (a, b) => Number(a.id_division) - Number(b.id_division)
    );
  }, [catedrasFiltradas]);

  const divisionesTexto = useMemo(() => {
    if (idsDivisiones.length === 0) return "Seleccioná una o varias divisiones.";

    const nombres = idsDivisiones
      .map(
        (id) =>
          divisionesActivas.find(
            (d) => Number(d.id_division) === Number(id)
          )?.nombre_division
      )
      .filter(Boolean);

    return nombres.length > 0
      ? nombres.join(", ")
      : `${idsDivisiones.length} división/es`;
  }, [idsDivisiones, divisionesActivas]);

  const catedrasSeleccionadasTexto = useMemo(() => {
    if (!idCurso) return "Primero seleccioná el curso/año del taller.";
    if (idsDivisiones.length === 0)
      return "Ahora seleccioná una o varias divisiones.";
    if (cargandoCatedras) return "Cargando cátedras reales...";
    if (seleccionadas.length === 0)
      return "No seleccionaste cátedras todavía.";

    return `${seleccionadas.length} cátedra${
      seleccionadas.length === 1 ? "" : "s"
    } seleccionada${seleccionadas.length === 1 ? "" : "s"}.`;
  }, [idCurso, idsDivisiones.length, cargandoCatedras, seleccionadas.length]);

  const cambiarCurso = (valor) => {
    setIdCurso(valor);
    setIdsDivisiones([]);
    setSeleccionadas([]);
    setIdArea("");
    setBusqueda("");
  };

  const toggleDivision = (idDivision) => {
    const id = Number(idDivision);
    if (!id) return;

    setIdsDivisiones((prev) => {
      const actual = prev.map(Number);
      if (actual.includes(id)) return actual.filter((x) => x !== id);
      return [...actual, id];
    });

    setSeleccionadas([]);
    setIdArea("");
    setBusqueda("");
  };

  const seleccionarTodasDivisiones = () => {
    setIdsDivisiones(
      divisionesActivas.map((d) => Number(d.id_division)).filter(Boolean)
    );
    setSeleccionadas([]);
    setIdArea("");
    setBusqueda("");
  };

  const limpiarDivisiones = () => {
    setIdsDivisiones([]);
    setSeleccionadas([]);
    setIdArea("");
    setBusqueda("");
  };

  const toggleCatedra = (idCatedra) => {
    const id = Number(idCatedra);

    setSeleccionadas((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const seleccionarVisibles = () => {
    const visibles = catedrasFiltradas.map((m) => Number(m.id_catedra));

    setSeleccionadas((prev) => {
      const set = new Set(prev.map(Number));
      visibles.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  const limpiarVisibles = () => {
    const visibles = new Set(
      catedrasFiltradas.map((m) => Number(m.id_catedra))
    );
    setSeleccionadas((prev) =>
      prev.filter((id) => !visibles.has(Number(id)))
    );
  };

  const limpiarTodo = () => {
    setSeleccionadas([]);
  };

  const guardar = async (e) => {
    e.preventDefault();

    const nombre = taller.trim().toUpperCase();

    if (!nombre) {
      alert("El nombre del taller es obligatorio.");
      return;
    }

    if (!idCurso) {
      alert("Tenés que seleccionar el curso/año al que pertenece el taller.");
      return;
    }

    if (idsDivisiones.length === 0) {
      alert("Tenés que seleccionar al menos una división.");
      return;
    }

    if (seleccionadas.length === 0) {
      alert("Tenés que seleccionar las cátedras específicas de ese taller.");
      return;
    }

    setGuardando(true);

    try {
      await onSave({
        id_taller: item?.id_taller || null,
        id_curso: Number(idCurso),
        divisiones: idsDivisiones.map(Number),
        id_division:
          idsDivisiones.length === 1 ? Number(idsDivisiones[0]) : undefined,
        taller: nombre,
        activo: activo ? 1 : 0,
        catedras: seleccionadas.map(Number),
      });
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div
      className="gm-modalOverlay materias-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        className="gm-modal gm-modal--materias-lg materias-modal materias-modal--taller large"
        onSubmit={guardar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="taller-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-modal__header materias-modal-header">
          <div
            className="gm-modal__headIcon materias-modal-icon"
            aria-hidden="true"
          >
            <FontAwesomeIcon icon={faFlask} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="taller-modal-title">
              {item ? "Editar taller" : "Nuevo taller"}
            </h2>
            <p>
              El taller se guarda con cátedras reales. La materia, el curso y la
              división se obtienen desde cada cátedra.
            </p>
          </div>

          <button
            type="button"
            className="gm-modal__close modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="materias-modal-scroll">
          <div className="form-grid three taller-main-grid">
            <label className="form-label">
              Nombre del taller
              <input
                value={taller}
                onChange={(e) => setTaller(e.target.value.toUpperCase())}
                placeholder="EJ: TALLER DIBUJO TÉCNICO"
                autoFocus
              />
            </label>

            <label className="form-label">
              Curso / año del taller
              <select
                value={idCurso}
                onChange={(e) => cambiarCurso(e.target.value)}
              >
                <option value="">Seleccionar curso</option>
                {cursosActivos.map((c) => (
                  <option key={c.id_curso} value={c.id_curso}>
                    {c.nombre_curso}
                  </option>
                ))}
              </select>
            </label>

            <label className="check-inline top-check">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Taller activo
            </label>
          </div>

          <div className="taller-box">
            <div className="taller-box-title-row">
              <div>
                <h4>Divisiones del taller</h4>
                <p className="muted">{divisionesTexto}</p>
              </div>

              <div className="taller-bulk-actions compact-actions">
                <button
                  type="button"
                  className="materias-btn ghost"
                  onClick={seleccionarTodasDivisiones}
                  disabled={!idCurso || divisionesActivas.length === 0}
                >
                  Todas
                </button>

                <button
                  type="button"
                  className="materias-btn ghost"
                  onClick={limpiarDivisiones}
                  disabled={idsDivisiones.length === 0}
                >
                  Limpiar
                </button>
              </div>
            </div>

            {!idCurso ? (
              <div className="muted asignar-empty">
                Seleccioná el curso para habilitar las divisiones.
              </div>
            ) : (
              <div className="materias-check-grid divisiones-check-grid">
                {divisionesActivas.map((d) => {
                  const id = Number(d.id_division);
                  const checked = idsDivisiones.map(Number).includes(id);

                  return (
                    <label
                      key={d.id_division}
                      className={`materia-check ${checked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDivision(id)}
                      />
                      <span>
                        <strong>{d.nombre_division}</strong>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="taller-box">
            <div className="taller-box-title-row">
              <div>
                <h4>Cátedras del taller</h4>
                <p className="muted">{catedrasSeleccionadasTexto}</p>
              </div>
            </div>

            {errorCatedras && (
              <div className="modal-inline-error">{errorCatedras}</div>
            )}

            <div className="taller-toolbar">
              <label className="form-label mini">
                Filtrar por área
                <select
                  value={idArea}
                  onChange={(e) => setIdArea(e.target.value)}
                  disabled={
                    !idCurso ||
                    idsDivisiones.length === 0 ||
                    cargandoCatedras
                  }
                >
                  <option value="">Todas las áreas</option>
                  {areas.map((a) => (
                    <option key={a.id_area} value={a.id_area}>
                      {a.area}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-label mini taller-search-label">
                Buscar cátedra
                <span className="taller-search-wrap">
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={
                      idCurso && idsDivisiones.length > 0
                        ? "Buscar por materia, área, división o docente"
                        : "Primero seleccioná curso y división"
                    }
                    disabled={
                      !idCurso ||
                      idsDivisiones.length === 0 ||
                      cargandoCatedras
                    }
                  />
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </span>
              </label>
            </div>

            <div className="taller-bulk-actions">
              <button
                type="button"
                className="materias-btn ghost"
                onClick={seleccionarVisibles}
                disabled={
                  !idCurso ||
                  idsDivisiones.length === 0 ||
                  cargandoCatedras ||
                  catedrasFiltradas.length === 0
                }
              >
                <FontAwesomeIcon icon={faCheck} />
                Seleccionar visibles
              </button>

              <button
                type="button"
                className="materias-btn ghost"
                onClick={limpiarVisibles}
                disabled={
                  !idCurso ||
                  idsDivisiones.length === 0 ||
                  cargandoCatedras ||
                  catedrasFiltradas.length === 0
                }
              >
                Limpiar visibles
              </button>

              <button
                type="button"
                className="materias-btn ghost"
                onClick={limpiarTodo}
                disabled={seleccionadas.length === 0}
              >
                Limpiar todo
              </button>
            </div>

            {!idCurso ? (
              <div className="muted asignar-empty">
                Seleccioná el curso del taller para cargar las cátedras.
              </div>
            ) : idsDivisiones.length === 0 ? (
              <div className="muted asignar-empty">
                Seleccioná una o varias divisiones. Después podés seleccionar
                las cátedras reales de cada división.
              </div>
            ) : cargandoCatedras ? (
              <div className="muted asignar-empty">
                Cargando cátedras del curso y divisiones seleccionadas...
              </div>
            ) : catedrasFiltradas.length === 0 ? (
              <div className="muted asignar-empty">
                No hay cátedras para mostrar con ese curso/división/filtro.
              </div>
            ) : (
              <div className="taller-catedras-groups">
                {catedrasAgrupadas.map((grupo) => (
                  <div
                    key={grupo.id_division || grupo.division}
                    className="taller-catedras-group"
                  >
                    <div className="taller-group-title">
                      División {grupo.division}
                    </div>

                    <div className="materias-check-grid">
                      {grupo.catedras.map((m) => {
                        const id = Number(m.id_catedra);
                        const checked = seleccionadas.includes(id);

                        return (
                          <label
                            key={m.id_catedra}
                            className={`materia-check ${
                              checked ? "checked" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCatedra(id)}
                            />

                            <span>
                              <strong>{m.materia}</strong>
                              {m.areas ? <small>{m.areas}</small> : null}
                              {m.docente ? (
                                <small>Docente: {m.docente}</small>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="gm-modal__actions modal-actions">
          <button type="button" className="materias-btn ghost" onClick={onClose}>
            Cancelar
          </button>

          <button
            type="submit"
            className="materias-btn primary"
            disabled={guardando || cargandoCatedras}
          >
            <FontAwesomeIcon icon={faSave} />
            {guardando ? "Guardando..." : "Guardar taller"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ModalTaller;