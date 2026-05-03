// src/components/Materias/modales/ModalTaller.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faFlask,
  faMagnifyingGlass,
  faSave,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const extraerIdsMaterias = (item) => {
  if (!item?.ids_materias) return [];

  return String(item.ids_materias)
    .split(",")
    .map((id) => Number(String(id).trim()))
    .filter(Boolean);
};

const ModalTaller = ({
  item,
  cursos = [],
  areas = [],
  onObtenerMateriasPorCurso,
  onClose,
  onSave,
}) => {
  const [taller, setTaller] = useState(item?.taller || "");
  const [idCurso, setIdCurso] = useState(item?.id_curso || "");
  const [activo, setActivo] = useState(item ? Number(item.activo) === 1 : true);
  const [idArea, setIdArea] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadas, setSeleccionadas] = useState(() => extraerIdsMaterias(item));
  const [materiasCurso, setMateriasCurso] = useState([]);
  const [cargandoMaterias, setCargandoMaterias] = useState(false);
  const [errorMaterias, setErrorMaterias] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setTaller(item?.taller || "");
    setIdCurso(item?.id_curso || "");
    setActivo(item ? Number(item.activo) === 1 : true);
    setSeleccionadas(extraerIdsMaterias(item));
    setIdArea("");
    setBusqueda("");
  }, [item]);

  useEffect(() => {
    let cancelado = false;

    const cargarMaterias = async () => {
      const id = Number(idCurso || 0);

      setErrorMaterias("");

      if (id <= 0) {
        setMateriasCurso([]);
        return;
      }

      if (typeof onObtenerMateriasPorCurso !== "function") {
        setMateriasCurso([]);
        setErrorMaterias("No está configurada la carga global de materias por curso.");
        return;
      }

      setCargandoMaterias(true);

      try {
        const lista = await onObtenerMateriasPorCurso(id);
        if (!cancelado) {
          setMateriasCurso(Array.isArray(lista) ? lista : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelado) {
          setMateriasCurso([]);
          setErrorMaterias("No se pudieron cargar las materias de ese curso.");
        }
      } finally {
        if (!cancelado) setCargandoMaterias(false);
      }
    };

    cargarMaterias();

    return () => {
      cancelado = true;
    };
  }, [idCurso, onObtenerMateriasPorCurso]);

  const cursosActivos = useMemo(() => {
    return cursos.filter((c) => Number(c.activo ?? 1) === 1);
  }, [cursos]);

  const materiasNormalizadas = useMemo(() => {
    return materiasCurso
      .map((m) => ({
        ...m,
        id_materia_num: Number(m.id_materia),
        activo_num: Number(m.activo ?? 1),
        ids_area_array: String(m.ids_areas || m.id_area || "")
          .split(",")
          .map((x) => Number(String(x).trim()))
          .filter(Boolean),
      }))
      .filter((m) => Number(m.id_materia_num) > 0);
  }, [materiasCurso]);

  const materiasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    const area = Number(idArea || 0);

    return materiasNormalizadas.filter((m) => {
      if (m.activo_num !== 1) return false;
      if (area > 0 && !m.ids_area_array.includes(area)) return false;
      if (!q) return true;

      return normalizar(m.materia).includes(q) || normalizar(m.areas).includes(q);
    });
  }, [materiasNormalizadas, idArea, busqueda]);

  const materiasSeleccionadasTexto = useMemo(() => {
    if (!idCurso) return "Primero seleccioná el curso/año del taller.";
    if (cargandoMaterias) return "Cargando materias desde cátedras...";
    if (seleccionadas.length === 0) return "No seleccionaste materias todavía.";

    return `${seleccionadas.length} materia${seleccionadas.length === 1 ? "" : "s"} seleccionada${seleccionadas.length === 1 ? "" : "s"}.`;
  }, [idCurso, cargandoMaterias, seleccionadas.length]);

  const cambiarCurso = (valor) => {
    setIdCurso(valor);
    setSeleccionadas([]);
    setIdArea("");
    setBusqueda("");
  };

  const toggleMateria = (idMateria) => {
    const id = Number(idMateria);

    setSeleccionadas((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const seleccionarVisibles = () => {
    const visibles = materiasFiltradas.map((m) => Number(m.id_materia));

    setSeleccionadas((prev) => {
      const set = new Set(prev.map(Number));
      visibles.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  const limpiarVisibles = () => {
    const visibles = new Set(materiasFiltradas.map((m) => Number(m.id_materia)));
    setSeleccionadas((prev) => prev.filter((id) => !visibles.has(Number(id))));
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

    if (seleccionadas.length === 0) {
      alert("Tenés que seleccionar las materias específicas de ese taller y curso.");
      return;
    }

    setGuardando(true);

    try {
      await onSave({
        id_taller: item?.id_taller || null,
        id_curso: Number(idCurso),
        taller: nombre,
        activo: activo ? 1 : 0,
        materias: seleccionadas.map(Number),
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="materias-modal-overlay">
      <form className="materias-modal large" onSubmit={guardar}>
        <div className="materias-modal-header">
          <div className="materias-modal-icon">
            <FontAwesomeIcon icon={faFlask} />
          </div>

          <div>
            <h3>{item ? "Editar taller" : "Nuevo taller"}</h3>
            <p>
              Indicá el curso exacto del taller. Al seleccionar el curso, las materias se consultan desde el módulo global usando cátedras.
            </p>
          </div>

          <button type="button" className="modal-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="form-grid two taller-main-grid">
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
            <select value={idCurso} onChange={(e) => cambiarCurso(e.target.value)}>
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
              <h4>Materias del taller</h4>
              <p className="muted">{materiasSeleccionadasTexto}</p>
            </div>
          </div>

          {errorMaterias && <div className="modal-inline-error">{errorMaterias}</div>}

          <div className="taller-toolbar">
            <label className="form-label mini">
              Filtrar por área
              <select value={idArea} onChange={(e) => setIdArea(e.target.value)} disabled={!idCurso || cargandoMaterias}>
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a.id_area} value={a.id_area}>
                    {a.area}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-label mini taller-search-label">
              Buscar materia
              <span className="taller-search-wrap">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={idCurso ? "Buscar por nombre o área" : "Primero seleccioná curso"}
                  disabled={!idCurso || cargandoMaterias}
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
              disabled={!idCurso || cargandoMaterias || materiasFiltradas.length === 0}
            >
              <FontAwesomeIcon icon={faCheck} />
              Seleccionar visibles
            </button>

            <button
              type="button"
              className="materias-btn ghost"
              onClick={limpiarVisibles}
              disabled={!idCurso || cargandoMaterias || materiasFiltradas.length === 0}
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
              Seleccioná el curso del taller para cargar las materias desde cátedras.
            </div>
          ) : cargandoMaterias ? (
            <div className="muted asignar-empty">
              Cargando materias del curso seleccionado...
            </div>
          ) : materiasFiltradas.length === 0 ? (
            <div className="muted asignar-empty">
              No hay materias para mostrar con ese curso/filtro.
            </div>
          ) : (
            <div className="materias-check-grid">
              {materiasFiltradas.map((m) => {
                const id = Number(m.id_materia);
                const checked = seleccionadas.includes(id);

                return (
                  <label
                    key={`${m.id_curso}-${m.id_materia}`}
                    className={`materia-check ${checked ? "checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMateria(id)}
                    />

                    <span>
                      <strong>{m.materia}</strong>
                      {m.areas ? <small>{m.areas}</small> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="materias-btn ghost" onClick={onClose}>
            Cancelar
          </button>

          <button type="submit" className="materias-btn primary" disabled={guardando || cargandoMaterias}>
            <FontAwesomeIcon icon={faSave} />
            {guardando ? "Guardando..." : "Guardar taller"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModalTaller;
