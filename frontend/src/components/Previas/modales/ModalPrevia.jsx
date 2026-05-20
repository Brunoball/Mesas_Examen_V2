import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faEdit,
  faLayerGroup,
  faPlus,
  faSave,
  faTimes,
  faTrash,
  faUserGraduate,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import './ModalPrevias.css';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function anioActual() {
  return new Date().getFullYear();
}

function dividirAlumno(alumno = '') {
  const texto = String(alumno || '').trim();
  if (!texto) return { apellido: '', nombre: '' };

  if (texto.includes(',')) {
    const [apellido, ...resto] = texto.split(',');
    return {
      apellido: apellido.trim(),
      nombre: resto.join(',').trim(),
    };
  }

  return { apellido: texto, nombre: '' };
}

function normalizarMayus(valor) {
  return String(valor || '').toUpperCase();
}

function crearMateriaInicial(condicionPreviaId = '') {
  return {
    uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materia_id_curso: '',
    materia_id_division: '',
    id_materia: '',
    id_condicion: condicionPreviaId || '',
    anio: String(anioActual()),
    fecha_carga: hoyISO(),
    inscripcion: '0',
  };
}

function claveMaterias(materia) {
  const idCurso = Number(materia?.materia_id_curso || 0);
  const idDivision = Number(materia?.materia_id_division || 0);
  if (idCurso <= 0 || idDivision <= 0) return '';
  return `${idCurso}-${idDivision}`;
}

function SelectField({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="gm-field">
      <select
        className="gm-input gm-select"
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
      >
        {children}
      </select>
      <span className={`gm-label${value ? ' is-up' : ''}`}>{label}</span>
    </label>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text', disabled = false }) {
  const inputRef = useRef(null);
  const esFecha = type === 'date';

  function abrirCalendario() {
    if (!esFecha || disabled) return;

    const input = inputRef.current;
    if (!input) return;

    try {
      input.focus({ preventScroll: true });
    } catch (e) {
      input.focus();
    }

    if (typeof input.showPicker !== 'function') return;

    try {
      input.showPicker();
    } catch (e) {
      // Si el navegador bloquea showPicker, al menos queda enfocado el campo.
    }
  }

  return (
    <label
      className={`gm-field${esFecha ? ' gm-field--date' : ''}`}
      onPointerDown={abrirCalendario}
    >
      <input
        ref={inputRef}
        className="gm-input"
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder=" "
        title={placeholder || label}
        disabled={disabled}
      />
      <span className={`gm-label${value ? ' is-up' : ''}`}>{label}</span>
    </label>
  );
}

export default function ModalPrevia({ modo = 'crear', item = null, catalogos, onObtenerMateriasPorCurso, onGuardar, onCerrar }) {
  const editando = modo === 'editar';
  const condiciones = catalogos?.condiciones || [];
  const cursos = catalogos?.cursos || [];
  const divisiones = catalogos?.divisiones || [];
  const catedras = catalogos?.catedras || []; // fallback viejo si existe, pero la fuente principal ahora es global_obtener_materias_por_curso

  const condicionPreviaId = useMemo(() => {
    const previa = condiciones.find((c) => String(c.condicion || '').toUpperCase() === 'PREVIA');
    return previa ? String(previa.id_condicion) : String(condiciones[0]?.id_condicion || '');
  }, [condiciones]);

  const alumnoInicial = dividirAlumno(item?.alumno || '');

  const [tabPrincipal, setTabPrincipal] = useState('alumno');
  const [tabMateria, setTabMateria] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const materiaTabsRef = useRef(null);
  const [materiasPorClave, setMateriasPorClave] = useState({});
  const [cargandoMateriasPorClave, setCargandoMateriasPorClave] = useState({});
  const [erroresMateriasPorClave, setErroresMateriasPorClave] = useState({});

  const [datosAlumno, setDatosAlumno] = useState({
    dni: item?.dni || '',
    apellido: alumnoInicial.apellido || '',
    nombre: alumnoInicial.nombre || '',
    cursando_id_curso: item?.cursando_id_curso ? String(item.cursando_id_curso) : '',
    cursando_id_division: item?.cursando_id_division ? String(item.cursando_id_division) : '',
  });

  const [materias, setMaterias] = useState(() => {
    if (editando && item) {
      return [{
        uid: `edit-${item.id_previa}`,
        id_previa: item.id_previa,
        materia_id_curso: item.materia_id_curso ? String(item.materia_id_curso) : '',
        materia_id_division: item.materia_id_division ? String(item.materia_id_division) : '',
        id_materia: item.id_materia ? String(item.id_materia) : '',
        id_condicion: item.id_condicion ? String(item.id_condicion) : condicionPreviaId,
        anio: item.anio ? String(item.anio) : String(anioActual()),
        fecha_carga: item.fecha_carga || hoyISO(),
        inscripcion: String(Number(item.inscripcion) === 1 ? 1 : 0),
      }];
    }

    return [crearMateriaInicial(condicionPreviaId)];
  });

  useEffect(() => {
    if (!editando && condicionPreviaId && materias.length === 1 && !materias[0].id_condicion) {
      setMaterias((prev) => prev.map((m) => ({ ...m, id_condicion: condicionPreviaId })));
    }
  }, [condicionPreviaId, editando, materias]);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!guardando) onCerrar();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [guardando, onCerrar]);

  useEffect(() => {
    if (editando || tabPrincipal !== 'materias') return;

    const contenedor = materiaTabsRef.current;
    const tabActiva = contenedor?.querySelector('[data-materia-active="true"]');

    if (typeof tabActiva?.scrollIntoView !== 'function') return;

    tabActiva.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [editando, tabPrincipal, tabMateria, materias.length]);

  const esEgresado = useMemo(() => {
    const curso = cursos.find((c) => String(c.id_curso) === String(datosAlumno.cursando_id_curso));
    return String(curso?.nombre_curso || '').toUpperCase() === 'EGRESADO';
  }, [cursos, datosAlumno.cursando_id_curso]);

  useEffect(() => {
    if (esEgresado && datosAlumno.cursando_id_division !== '') {
      setDatosAlumno((prev) => ({ ...prev, cursando_id_division: '' }));
    }
  }, [esEgresado, datosAlumno.cursando_id_division]);

  const materiaActual = materias[tabMateria] || materias[0];
  const claveMateriaActual = claveMaterias(materiaActual);
  const cargandoMateriasActuales = Boolean(claveMateriaActual && cargandoMateriasPorClave[claveMateriaActual]);
  const errorMateriasActuales = claveMateriaActual ? erroresMateriasPorClave[claveMateriaActual] || '' : '';

  useEffect(() => {
    let cancelado = false;

    async function cargarMateriasDesdeGlobal() {
      const clave = claveMaterias(materiaActual);
      const idCurso = Number(materiaActual?.materia_id_curso || 0);
      const idDivision = Number(materiaActual?.materia_id_division || 0);

      if (!clave || idCurso <= 0 || idDivision <= 0) return;
      if (Array.isArray(materiasPorClave[clave])) return;
      if (typeof onObtenerMateriasPorCurso !== 'function') return;

      setCargandoMateriasPorClave((prev) => ({ ...prev, [clave]: true }));
      setErroresMateriasPorClave((prev) => ({ ...prev, [clave]: '' }));

      try {
        const lista = await onObtenerMateriasPorCurso(idCurso, idDivision);
        if (!cancelado) {
          setMateriasPorClave((prev) => ({
            ...prev,
            [clave]: Array.isArray(lista) ? lista : [],
          }));
        }
      } catch (e) {
        console.error('No se pudieron cargar las materias desde global:', e);
        if (!cancelado) {
          setMateriasPorClave((prev) => ({ ...prev, [clave]: [] }));
          setErroresMateriasPorClave((prev) => ({
            ...prev,
            [clave]: 'No se pudieron cargar las materias de ese curso y división.',
          }));
        }
      } finally {
        if (!cancelado) {
          setCargandoMateriasPorClave((prev) => ({ ...prev, [clave]: false }));
        }
      }
    }

    cargarMateriasDesdeGlobal();

    return () => {
      cancelado = true;
    };
  }, [materiaActual?.materia_id_curso, materiaActual?.materia_id_division, materiasPorClave, onObtenerMateriasPorCurso]);

  function actualizarAlumno(campo, valor) {
    setDatosAlumno((prev) => ({ ...prev, [campo]: valor }));
  }

  function actualizarMateria(index, campo, valor) {
    setMaterias((prev) => prev.map((m, i) => {
      if (i !== index) return m;

      const actualizado = { ...m, [campo]: valor };
      if (campo === 'materia_id_curso') {
        actualizado.materia_id_division = '';
        actualizado.id_materia = '';
      }
      if (campo === 'materia_id_division') {
        actualizado.id_materia = '';
      }

      return actualizado;
    }));
  }

  function agregarMateria() {
    setMaterias((prev) => [...prev, crearMateriaInicial(condicionPreviaId)]);
    setTabMateria(materias.length);
    setTabPrincipal('materias');
  }

  function quitarMateria(index) {
    if (materias.length === 1) return;
    setMaterias((prev) => prev.filter((_, i) => i !== index));
    setTabMateria((actual) => Math.max(0, Math.min(actual, materias.length - 2)));
  }

  function materiasDisponiblesPara(materia) {
    if (!materia?.materia_id_curso || !materia?.materia_id_division) return [];

    const clave = claveMaterias(materia);
    const materiasGlobal = Array.isArray(materiasPorClave[clave]) ? materiasPorClave[clave] : [];
    const fuente = materiasGlobal.length > 0
      ? materiasGlobal
      : catedras.filter((c) => (
        String(c.id_curso) === String(materia.materia_id_curso) &&
        String(c.id_division) === String(materia.materia_id_division)
      ));

    const mapa = new Map();
    fuente.forEach((m) => {
      const id = String(m.id_materia || '').trim();
      if (!id) return;
      mapa.set(id, {
        ...m,
        id_materia: m.id_materia,
        materia: m.materia,
      });
    });

    return Array.from(mapa.values()).sort((a, b) => String(a.materia || '').localeCompare(String(b.materia || ''), 'es'));
  }

  function textoOpcionMateria() {
    if (!materiaActual?.materia_id_curso || !materiaActual?.materia_id_division) return 'Elegí curso y división de materia';
    if (cargandoMateriasActuales) return 'Cargando materias...';
    if (errorMateriasActuales) return 'No se pudieron cargar materias';
    return 'Seleccionar...';
  }

  function validar() {
    if (!String(datosAlumno.dni || '').replace(/\D/g, '')) return 'Ingresá el DNI del alumno.';
    if (!datosAlumno.apellido.trim()) return 'Ingresá el apellido del alumno.';
    if (!datosAlumno.nombre.trim()) return 'Ingresá el nombre del alumno.';
    if (!datosAlumno.cursando_id_curso) return 'Seleccioná el curso actual del alumno.';
    if (!esEgresado && !datosAlumno.cursando_id_division) return 'Seleccioná la división actual del alumno.';

    for (let i = 0; i < materias.length; i += 1) {
      const m = materias[i];
      const numero = i + 1;
      if (!m.materia_id_curso) return `Seleccioná el curso de la materia ${numero}.`;
      if (!m.materia_id_division) return `Seleccioná la división de la materia ${numero}.`;
      if (!m.id_materia) return `Seleccioná la materia ${numero}.`;
      if (!m.id_condicion) return `Seleccioná la condición de la materia ${numero}.`;
      if (!m.anio || Number(m.anio) < 2000) return `Ingresá un año válido para la materia ${numero}.`;
      if (!m.fecha_carga) return `Ingresá la fecha de carga de la materia ${numero}.`;
    }

    return '';
  }

  async function guardar() {
    const msg = validar();
    if (msg) {
      setError(msg);
      return;
    }

    setGuardando(true);
    setError('');

    const base = {
      dni: String(datosAlumno.dni || '').replace(/\D/g, ''),
      apellido: normalizarMayus(datosAlumno.apellido),
      nombre: normalizarMayus(datosAlumno.nombre),
      cursando_id_curso: Number(datosAlumno.cursando_id_curso),
      cursando_id_division: datosAlumno.cursando_id_division ? Number(datosAlumno.cursando_id_division) : null,
    };

    const previasPayload = materias.map((m) => ({
      materia_id_curso: Number(m.materia_id_curso),
      materia_id_division: Number(m.materia_id_division),
      id_materia: Number(m.id_materia),
      id_condicion: Number(m.id_condicion),
      anio: Number(m.anio),
      fecha_carga: m.fecha_carga,
      inscripcion: Number(m.inscripcion) === 1 ? 1 : 0,
    }));

    const payload = editando
      ? { ...base, ...previasPayload[0], id_previa: item?.id_previa }
      : { ...base, previas: previasPayload };

    const res = await onGuardar(payload);
    setGuardando(false);

    if (res?.ok) {
      onCerrar();
      return;
    }

    setError(res?.mensaje || 'No se pudo guardar la previa.');
  }

  const titulo = editando ? 'Editar Previa' : 'Agregar Previa(s)';
  const subtitulo = editando ? 'Modificá los datos de la previa' : 'Cargá los datos del alumno y las materias previas';

  const materiaPanel = materiaActual && (
    <section className="gm-panel previas-panel previas-panel--materia">
      <div className="gm-panel__head">
        <div>
          <span className="gm-panel__eyebrow">Materia previa</span>
          <h3><FontAwesomeIcon icon={faBookOpen} /> {editando ? 'Materia' : `Materia ${tabMateria + 1}`}</h3>
        </div>
        {!editando && materias.length > 1 && (
          <button
            type="button"
            className="gm-iconBtn gm-iconBtn--danger previas-removeMateria"
            onClick={() => quitarMateria(tabMateria)}
            title="Quitar materia"
            aria-label="Quitar materia"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        )}
      </div>

      <div className="gm-panel__body">
        <div className="previas-two-cols">
          <SelectField
            label="Materia: curso"
            value={materiaActual.materia_id_curso}
            onChange={(e) => actualizarMateria(tabMateria, 'materia_id_curso', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {cursos.filter((c) => String(c.nombre_curso).toUpperCase() !== 'EGRESADO').map((c) => (
              <option key={c.id_curso} value={c.id_curso}>{c.nombre_curso}</option>
            ))}
          </SelectField>

          <SelectField
            label="Materia: división"
            value={materiaActual.materia_id_division}
            onChange={(e) => actualizarMateria(tabMateria, 'materia_id_division', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {divisiones.map((d) => (
              <option key={d.id_division} value={d.id_division}>{d.nombre_division}</option>
            ))}
          </SelectField>
        </div>

        <SelectField
          label="Materia"
          value={materiaActual.id_materia}
          onChange={(e) => actualizarMateria(tabMateria, 'id_materia', e.target.value)}
          disabled={!materiaActual.materia_id_curso || !materiaActual.materia_id_division || cargandoMateriasActuales}
        >
          <option value="">{textoOpcionMateria()}</option>
          {materiasDisponiblesPara(materiaActual).map((m) => (
            <option key={m.id_materia} value={m.id_materia}>{m.materia}</option>
          ))}
        </SelectField>

        {errorMateriasActuales && (
          <div className="gm-alert gm-alert--error gm-alert--banner previas-form-error">
            {errorMateriasActuales}
          </div>
        )}
      </div>
    </section>
  );

  const administrativoPanel = materiaActual && (
    <section className="gm-panel previas-panel previas-panel--administrativo">
      <div className="gm-panel__head">
        <div>
          <span className="gm-panel__eyebrow">Administrativo</span>
          <h3><FontAwesomeIcon icon={faLayerGroup} /> Datos de la previa</h3>
        </div>
        <span className="gm-panel__tag">Obligatorio</span>
      </div>

      <div className="gm-panel__body">
        <SelectField
          label="Condición"
          value={materiaActual.id_condicion}
          onChange={(e) => actualizarMateria(tabMateria, 'id_condicion', e.target.value)}
        >
          <option value="">Seleccionar...</option>
          {condiciones.map((c) => (
            <option key={c.id_condicion} value={c.id_condicion}>{c.condicion}</option>
          ))}
        </SelectField>

        <div className="previas-two-cols">
          <InputField
            label="Año (previa)"
            type="number"
            value={materiaActual.anio}
            onChange={(e) => actualizarMateria(tabMateria, 'anio', e.target.value)}
          />
          <InputField
            label="Fecha carga"
            type="date"
            value={materiaActual.fecha_carga}
            onChange={(e) => actualizarMateria(tabMateria, 'fecha_carga', e.target.value)}
          />
        </div>

        <SelectField
          label="Inscripción"
          value={materiaActual.inscripcion}
          onChange={(e) => actualizarMateria(tabMateria, 'inscripcion', e.target.value)}
        >
          <option value="0">No</option>
          <option value="1">Sí</option>
        </SelectField>
      </div>
    </section>
  );

  const cursadoPanel = (
    <section className="gm-panel previas-panel previas-panel--cursado">
      <div className="gm-panel__head">
        <div>
          <span className="gm-panel__eyebrow">Cursado</span>
          <h3><FontAwesomeIcon icon={faLayerGroup} /> {editando ? 'Cursado' : 'Cursado actual'}</h3>
        </div>
        <span className="gm-panel__tag">Alumno</span>
      </div>

      <div className="gm-panel__body">
        <div className="previas-two-cols">
          <SelectField
            label={editando ? 'Curso' : 'Curso actual'}
            value={datosAlumno.cursando_id_curso}
            onChange={(e) => actualizarAlumno('cursando_id_curso', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {cursos.map((c) => (
              <option key={c.id_curso} value={c.id_curso}>{c.nombre_curso}</option>
            ))}
          </SelectField>

          <SelectField
            label={editando ? 'División' : 'División actual'}
            value={datosAlumno.cursando_id_division}
            onChange={(e) => actualizarAlumno('cursando_id_division', e.target.value)}
            disabled={esEgresado}
          >
            <option value="">{esEgresado ? 'No aplica' : 'Seleccionar...'}</option>
            {divisiones.map((d) => (
              <option key={d.id_division} value={d.id_division}>{d.nombre_division}</option>
            ))}
          </SelectField>
        </div>
      </div>
    </section>
  );

  const modal = (
    <div
      className="gm-modalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="gm-modal gm-modal--docente gm-modal--previas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="previas-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="gm-modal__header">
          <div className="gm-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={editando ? faEdit : faBookOpen} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="previas-modal-title">{titulo}</h2>
            <p>{subtitulo}</p>
          </div>

          <button
            type="button"
            className="gm-modal__close"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="gm-modal__content">
          {!editando && (
            <div className="gm-tabs gm-tabs--google" role="tablist" aria-label="Secciones de previas">
              <button
                type="button"
                role="tab"
                aria-selected={tabPrincipal === 'alumno'}
                className={`gm-tab${tabPrincipal === 'alumno' ? ' is-active' : ''}`}
                onClick={() => setTabPrincipal('alumno')}
              >
                <FontAwesomeIcon icon={faUserGraduate} />
                <span>Datos del alumno</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tabPrincipal === 'materias'}
                className={`gm-tab${tabPrincipal === 'materias' ? ' is-active' : ''}`}
                onClick={() => setTabPrincipal('materias')}
              >
                <FontAwesomeIcon icon={faLayerGroup} />
                <span>Materias previas</span>
                <span className="gm-tab__badge">{materias.length}</span>
              </button>
            </div>
          )}

          {(editando || tabPrincipal === 'alumno') && (
            <div className={`previas-form-grid${editando ? ' previas-form-grid-edit' : ''}`}>
              <section className="gm-panel previas-panel">
                <div className="gm-panel__head">
                  <div>
                    <span className="gm-panel__eyebrow">Ficha principal</span>
                    <h3><FontAwesomeIcon icon={faUserGraduate} /> Datos del alumno</h3>
                  </div>
                  <span className="gm-panel__tag">Obligatorio</span>
                </div>

                <div className="gm-panel__body">
                  <InputField
                    label="DNI"
                    value={datosAlumno.dni}
                    onChange={(e) => actualizarAlumno('dni', e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej: 40123456"
                  />
                  <InputField
                    label="Apellido"
                    value={datosAlumno.apellido}
                    onChange={(e) => actualizarAlumno('apellido', normalizarMayus(e.target.value))}
                    placeholder="Ej: PÉREZ"
                  />
                  <InputField
                    label="Nombre"
                    value={datosAlumno.nombre}
                    onChange={(e) => actualizarAlumno('nombre', normalizarMayus(e.target.value))}
                    placeholder="Ej: ANA MARÍA"
                  />
                </div>
              </section>

              {editando ? (
                <>
                  {administrativoPanel}
                  {materiaPanel}
                  {cursadoPanel}
                </>
              ) : (
                cursadoPanel
              )}
            </div>
          )}

          {!editando && tabPrincipal === 'materias' && (
            <>
              <div className="previas-materia-tabs-shell">
                <div
                  ref={materiaTabsRef}
                  className="gm-tabs gm-tabs--google previas-materia-tabs"
                  role="tablist"
                  aria-label="Materias previas cargadas"
                >
                  {materias.map((m, index) => (
                    <button
                      key={m.uid}
                      type="button"
                      role="tab"
                      aria-selected={tabMateria === index}
                      data-materia-active={tabMateria === index ? 'true' : 'false'}
                      className={`gm-tab${tabMateria === index ? ' is-active' : ''}`}
                      onClick={() => setTabMateria(index)}
                    >
                      <FontAwesomeIcon icon={faBookOpen} />
                      <span>Materia {index + 1}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="gm-tab previas-materia-tab-add"
                  onClick={agregarMateria}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Otra</span>
                </button>
              </div>

              {materiaActual && (
                <div className="previas-form-grid previas-form-grid-two">
                  {materiaPanel}
                  {administrativoPanel}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="gm-alert gm-alert--error gm-alert--banner previas-form-error">
              {error}
            </div>
          )}
        </div>

        <div className="gm-modal__actions">
          {!editando && tabPrincipal === 'alumno' ? (
            <button type="button" className="gm-btn gm-btn--primary" onClick={() => setTabPrincipal('materias')}>
              Continuar a materias
            </button>
          ) : (
            <button type="button" className="gm-btn gm-btn--primary" onClick={guardar} disabled={guardando}>
              <FontAwesomeIcon icon={faSave} />
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : `Guardar ${materias.length === 1 ? 'previa' : `${materias.length} previas`}`}
            </button>
          )}

          <button type="button" className="gm-btn gm-btn--ghost" onClick={onCerrar} disabled={guardando}>
            <FontAwesomeIcon icon={faTimes} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
