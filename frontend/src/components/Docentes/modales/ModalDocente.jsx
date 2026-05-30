import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faEnvelope,
  faIdCard,
  faInfoCircle,
  faPlus,
  faSave,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import ModalTutorialGlobal from '../../Global/Modales/ModalTutorialGlobal';
import '../../Global/Global_css/Global_Modals.css';

const DIAS_SEMANA_DEFAULT = [
  { id_dia_semana: 1, dia_semana: 'LUNES' },
  { id_dia_semana: 2, dia_semana: 'MARTES' },
  { id_dia_semana: 3, dia_semana: 'MIÉRCOLES' },
  { id_dia_semana: 4, dia_semana: 'JUEVES' },
  { id_dia_semana: 5, dia_semana: 'VIERNES' },
];

const MAX_REGLAS_DISPONIBILIDAD = 5;
const TAB_FICHA = 'ficha';
const TAB_ORGANIZACION = 'organizacion';

function idsDesdeItem(item) {
  if (Array.isArray(item?.ids_docentes)) {
    return item.ids_docentes.map(Number).filter(Boolean);
  }
  if (item?.ids_docentes_texto) {
    return String(item.ids_docentes_texto).split(',').map(Number).filter(Boolean);
  }
  return item?.id_docente ? [Number(item.id_docente)] : [];
}

function normalizarDisponibilidad(bloque) {
  return {
    id_dia_semana: bloque?.id_dia_semana ? String(bloque.id_dia_semana) : '',
    id_turno: bloque?.id_turno ? String(bloque.id_turno) : '',
    fecha: bloque?.fecha || '',
  };
}

function intentarAbrirSelectorFecha(e) {
  const input = e.currentTarget.querySelector('input');
  if (!input || input.disabled) return;
  if (typeof input.showPicker === 'function') {
    try { input.showPicker(); return; } catch (_) { input.focus(); }
  }
  input.focus();
}

function reglaTieneDatos(bloque) {
  return Boolean(bloque?.id_dia_semana || bloque?.id_turno || bloque?.fecha);
}

function reglaTieneConfiguracionValida(bloque) {
  if (!reglaTieneDatos(bloque)) return false;
  if (bloque.id_turno || bloque.fecha) return true;
  return false;
}

function obtenerEstadoInicial(modo, item) {
  if (modo !== 'editar') {
    return {
      pestaniaActiva: TAB_FICHA,
      docente: '',
      dni: '',
      email: '',
      activo: 1,
      comentarios: '',
      disponibilidades: [],
      mostrarTutorial: false,
      error: '',
    };
  }
  return {
    pestaniaActiva: TAB_FICHA,
    docente: item?.docente || '',
    dni: item?.dni || '',
    email: item?.email || item?.gmail || '',
    activo: Number(item?.activo ?? 1),
    comentarios: item?.comentarios || item?.comentario || item?.observacion || '',
    disponibilidades: Array.isArray(item?.disponibilidades)
      ? item.disponibilidades.map(normalizarDisponibilidad).slice(0, MAX_REGLAS_DISPONIBILIDAD)
      : [],
    mostrarTutorial: false,
    error: '',
  };
}

export default function ModalDocente({
  modo = 'crear',
  item,
  catalogos,
  onGuardar,
  onCerrar,
  onToast,
}) {
  const estadoInicial = useMemo(() => obtenerEstadoInicial(modo, item), [modo, item]);

  const [pestaniaActiva, setPestaniaActiva] = useState(() => estadoInicial.pestaniaActiva);
  const [docente, setDocente] = useState(() => estadoInicial.docente);
  const [dni, setDni] = useState(() => estadoInicial.dni);
  const [email, setEmail] = useState(() => estadoInicial.email);
  const [activo, setActivo] = useState(() => estadoInicial.activo);
  const [comentarios, setComentarios] = useState(() => estadoInicial.comentarios);
  const [disponibilidades, setDisponibilidades] = useState(() => estadoInicial.disponibilidades);
  const [mostrarTutorial, setMostrarTutorial] = useState(() => estadoInicial.mostrarTutorial);
  const [guardando, setGuardando] = useState(false);

  const primerRender = useRef(true);
  const editando = modo === 'editar' && item?.id_docente;

  useEffect(() => {
    if (primerRender.current) { primerRender.current = false; return; }
    const nuevoEstado = obtenerEstadoInicial(modo, item);
    setPestaniaActiva(nuevoEstado.pestaniaActiva);
    setDocente(nuevoEstado.docente);
    setDni(nuevoEstado.dni);
    setEmail(nuevoEstado.email);
    setActivo(nuevoEstado.activo);
    setComentarios(nuevoEstado.comentarios);
    setDisponibilidades(nuevoEstado.disponibilidades);
    setMostrarTutorial(nuevoEstado.mostrarTutorial);
  }, [modo, item]);

  useEffect(() => {
    const body = document.body;
    const overflowAnterior = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = overflowAnterior; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      if (mostrarTutorial) { setMostrarTutorial(false); return; }
      if (!guardando) onCerrar();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [guardando, mostrarTutorial, onCerrar]);

  const titulo = editando ? 'Editar docente' : 'Agregar docente';

  const diasSemana = useMemo(() => {
    return Array.isArray(catalogos?.dias_semana) && catalogos.dias_semana.length > 0
      ? catalogos.dias_semana
      : DIAS_SEMANA_DEFAULT;
  }, [catalogos?.dias_semana]);

  const reglasConDatos = useMemo(
    () => disponibilidades.filter(reglaTieneDatos),
    [disponibilidades]
  );

  const disponibilidadesCompletas = useMemo(
    () => reglasConDatos.filter(reglaTieneConfiguracionValida).length,
    [reglasConDatos]
  );

  const resumenRegistros = useMemo(() => {
    const ids = idsDesdeItem(item);
    if (!editando || ids.length <= 1) return '';
    return `Este docente tiene ${ids.length} registros internos heredados. Se actualizarán juntos para no repetirlo.`;
  }, [editando, item]);

  const puedeAgregarDisponibilidad = disponibilidades.length < MAX_REGLAS_DISPONIBILIDAD;

  function agregarDisponibilidad() {
    setDisponibilidades((prev) => {
      if (prev.length >= MAX_REGLAS_DISPONIBILIDAD) return prev;
      return [...prev, { id_dia_semana: '', id_turno: '', fecha: '' }];
    });
  }

  function actualizarDisponibilidad(index, campo, valor) {
    setDisponibilidades((prev) =>
      prev.map((itemBloque, i) => i === index ? { ...itemBloque, [campo]: valor } : itemBloque)
    );
  }

  function eliminarDisponibilidad(index) {
    setDisponibilidades((prev) => prev.filter((_, i) => i !== index));
  }

  function mostrarToastError(texto) {
    if (typeof onToast === 'function') onToast('error', texto);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!docente.trim()) {
      setPestaniaActiva(TAB_FICHA);
      mostrarToastError('El nombre del docente es obligatorio.');
      return;
    }

    const dniLimpio = String(dni || '').replace(/\D/g, '').slice(0, 20);
    const emailLimpio = String(email || '').trim().toLowerCase();

    if (emailLimpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      setPestaniaActiva(TAB_FICHA);
      mostrarToastError('El Gmail/email ingresado no tiene un formato válido.');
      return;
    }

    const reglasConDatosActuales = disponibilidades.filter(reglaTieneDatos);
    const reglaInvalida = reglasConDatosActuales.find((bloque) => !reglaTieneConfiguracionValida(bloque));
    if (reglaInvalida) {
      setPestaniaActiva(TAB_ORGANIZACION);
      mostrarToastError('Cada regla debe tener al menos un turno o una fecha. Los slots vacíos se ignoran.');
      return;
    }

    const reglasSoloTurno = reglasConDatosActuales.filter(
      (bloque) => bloque.id_turno && !bloque.fecha && !bloque.id_dia_semana
    );
    if (reglasSoloTurno.length > 1) {
      setPestaniaActiva(TAB_ORGANIZACION);
      mostrarToastError('Solo se permite una regla de "solo turno" sin fecha.');
      return;
    }

    const disponibilidadesValidas = reglasConDatosActuales.map((bloque) => ({
      id_dia_semana: bloque.id_dia_semana ? Number(bloque.id_dia_semana) : null,
      id_turno: bloque.id_turno ? Number(bloque.id_turno) : null,
      fecha: bloque.fecha || null,
    }));

    const comentariosLimpios = comentarios.trim();
    const payload = {
      id_docente: item?.id_docente || 0,
      ids_docentes: idsDesdeItem(item),
      docente: docente.trim(),
      dni: dniLimpio,
      email: emailLimpio,
      gmail: emailLimpio,
      activo,
      comentarios: comentariosLimpios,
      comentario: comentariosLimpios,
      observacion: comentariosLimpios,
      disponibilidades: disponibilidadesValidas,
    };

    setGuardando(true);

    let modalCerrado = false;

    try {
      const promesaGuardado = onGuardar(payload, { modo: editando ? 'editar' : 'crear' });
      modalCerrado = true;
      onCerrar();
      await promesaGuardado;
    } catch (err) {
      mostrarToastError(err?.message || 'No se pudo guardar el docente.');
      if (!modalCerrado) setGuardando(false);
    }
  }

  const modal = (
    <div
      className="gm-modalOverlay"
      role="presentation"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        className="gm-modal gm-modal--docente"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gm-docente-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="gm-modal__header">
          <div className="gm-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faUserTie} />
          </div>
          <div className="gm-modal__headText">
            <h2 id="gm-docente-title">{titulo}</h2>
            <p>{editando ? 'Actualizá la ficha del docente sin perder su organización.' : 'Cargá la ficha del docente y su disponibilidad en pasos claros.'}</p>
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
        </div>

        <form onSubmit={handleSubmit} className="gm-modal__form">
          <div className="gm-modal__content">

            {/* INDICADORES */}
            {resumenRegistros && (
              <div className="gm-alert gm-alert--info gm-alert--banner">
                <FontAwesomeIcon icon={faInfoCircle} />
                <span>{resumenRegistros}</span>
              </div>
            )}

            {/* TABS */}
            <div className="gm-tabs gm-tabs--google" role="tablist" aria-label="Secciones del docente">
              <button
                type="button"
                role="tab"
                id="gm-tab-ficha"
                aria-controls="gm-panel-ficha"
                aria-selected={pestaniaActiva === TAB_FICHA}
                className={`gm-tab${pestaniaActiva === TAB_FICHA ? ' is-active' : ''}`}
                onClick={() => setPestaniaActiva(TAB_FICHA)}
              >
                <FontAwesomeIcon icon={faUserTie} />
                <span>Ficha principal</span>
              </button>
              <button
                type="button"
                role="tab"
                id="gm-tab-organizacion"
                aria-controls="gm-panel-organizacion"
                aria-selected={pestaniaActiva === TAB_ORGANIZACION}
                className={`gm-tab${pestaniaActiva === TAB_ORGANIZACION ? ' is-active' : ''}`}
                onClick={() => setPestaniaActiva(TAB_ORGANIZACION)}
              >
                <FontAwesomeIcon icon={faCalendarDays} />
                <span>Organización semanal</span>
                {disponibilidadesCompletas > 0 && (
                  <span className="gm-tab__badge">{disponibilidadesCompletas}</span>
                )}
              </button>
            </div>

            {/* TAB: FICHA */}
            {pestaniaActiva === TAB_FICHA && (
              <section className="gm-panel" id="gm-panel-ficha" role="tabpanel" aria-labelledby="gm-tab-ficha">
                <div className="gm-panel__head">
                  <div>
                    <span className="gm-panel__eyebrow">Ficha principal</span>
                    <h3><FontAwesomeIcon icon={faUserTie} /> Datos del docente</h3>
                  </div>
                  <span className="gm-panel__tag">Obligatorio</span>
                </div>

                <div className="gm-panel__body">
                  {/* Nombre — fila completa */}
                  <div className="gm-formRow gm-formRow--full">
                    <label className="gm-field">
                      <input
                        className="gm-input"
                        type="text"
                        value={docente}
                        onChange={(e) => setDocente(e.target.value.toUpperCase())}
                        placeholder=" "
                        disabled={guardando}
                      />
                      <span className="gm-label">Nombre y apellido *</span>
                    </label>
                  </div>

                  <div className="gm-formRow gm-formRow--two docentes-formRow-contacto">
                    <label className="gm-field">
                      <input
                        className="gm-input"
                        type="text"
                        inputMode="numeric"
                        value={dni}
                        onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 20))}
                        placeholder=" "
                        disabled={guardando}
                      />
                      <span className={`gm-label${dni ? ' is-up' : ''}`}>
                        <FontAwesomeIcon icon={faIdCard} /> DNI
                      </span>
                    </label>

                    <label className="gm-field">
                      <input
                        className="gm-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value.toLowerCase())}
                        placeholder=" "
                        disabled={guardando}
                      />
                      <span className={`gm-label${email ? ' is-up' : ''}`}>
                        <FontAwesomeIcon icon={faEnvelope} /> Gmail / email
                      </span>
                    </label>
                  </div>

                  {/* Estado — el cargo ya no pertenece al docente, se define por cátedra */}
                  <div className="gm-formRow gm-formRow--full">
                    <div className="gm-field gm-field--status gm-field--statusFull">
                      <div className="gm-statusToggle" role="group" aria-label="Estado del docente">
                        <button
                          type="button"
                          className={`gm-statusToggle__btn${Number(activo) === 1 ? ' is-active' : ''}`}
                          onClick={() => setActivo(1)}
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faUserCheck} /> Activo
                        </button>
                        <button
                          type="button"
                          className={`gm-statusToggle__btn gm-statusToggle__btn--danger${Number(activo) === 0 ? ' is-active' : ''}`}
                          onClick={() => setActivo(0)}
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faUserSlash} /> Inactivo
                        </button>
                      </div>
                      <span className="gm-label is-up">Estado</span>
                    </div>
                  </div>

                  <div className="gm-alert gm-alert--info gm-alert--banner docentes-cargoInfoBox">
                    <FontAwesomeIcon icon={faInfoCircle} />
                    <span>El cargo ya no se carga en la ficha del docente. Ahora corresponde a cada cátedra/materia y se verá en el detalle del docente.</span>
                  </div>

                  {/* Comentarios — fila completa */}
                  <div className="gm-formRow gm-formRow--full">
                    <label className="gm-field gm-field--textarea">
                      <textarea
                        className="gm-input"
                        value={comentarios}
                        onChange={(e) => setComentarios(e.target.value)}
                        placeholder=" "
                        disabled={guardando}
                        maxLength={500}
                      />
                      <span className={`gm-label${comentarios ? ' is-up' : ''}`}>
                        Comentarios opcionales
                      </span>
                    </label>
                  </div>

                </div>
              </section>
            )}

            {/* TAB: ORGANIZACIÓN */}
            {pestaniaActiva === TAB_ORGANIZACION && (
              <section className="gm-panel gm-panel--schedule" id="gm-panel-organizacion" role="tabpanel" aria-labelledby="gm-tab-organizacion">
                <div className="gm-panel__head gm-panel__head--split">
                  <div>
                    <span className="gm-panel__eyebrow">Organización semanal</span>
                    <h3><FontAwesomeIcon icon={faCalendarDays} /> Disponibilidad</h3>
                  </div>
                  <div className="gm-panel__actions">
                    <button
                      type="button"
                      className={`gm-iconBtn gm-iconBtn--help${mostrarTutorial ? ' is-active' : ''}`}
                      onClick={() => setMostrarTutorial((v) => !v)}
                      title={mostrarTutorial ? 'Cerrar ayuda' : 'Ver tutorial'}
                      aria-label={mostrarTutorial ? 'Cerrar ayuda de disponibilidad' : 'Ver ayuda de disponibilidad'}
                    >
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                    <button
                      type="button"
                      className="gm-btn gm-btn--soft"
                      onClick={agregarDisponibilidad}
                      disabled={guardando || !puedeAgregarDisponibilidad}
                    >
                      <FontAwesomeIcon icon={faPlus} /> Agregar regla
                    </button>
                  </div>
                </div>

                <div className="gm-panel__body">
                  <div className="gm-ruleCounter">
                    <span>{disponibilidades.length}/{MAX_REGLAS_DISPONIBILIDAD} reglas creadas</span>
                    <strong>Los slots vacíos se ignoran al guardar.</strong>
                  </div>

                  {disponibilidades.length === 0 && (
                    <div className="gm-emptySchedule">
                      <div className="gm-emptySchedule__icon">
                        <FontAwesomeIcon icon={faCalendarDays} />
                      </div>
                      <strong>Sin reglas cargadas</strong>
                      <span>Usá "Agregar regla" para definir hasta {MAX_REGLAS_DISPONIBILIDAD} indisponibilidades del docente.</span>
                    </div>
                  )}

                  {disponibilidades.length > 0 && (
                    <div className="gm-scheduleList gd-scheduls">
                      {disponibilidades.map((bloque, index) => (
                        <article
                          className="gm-scheduleCard"
                          key={`${bloque.id_dia_semana}-${bloque.id_turno}-${bloque.fecha}-${index}`}
                        >
                          <div className="gm-scheduleCard__head">
                            <div className="gm-scheduleCard__number">
                              {String(index + 1).padStart(2, '0')}
                            </div>
                            <div>
                              <strong>Regla de disponibilidad</strong>
                              <span>Turno, fecha o combinación puntual</span>
                            </div>
                            <button
                              type="button"
                              className="gm-iconBtn gm-iconBtn--danger"
                              onClick={() => eliminarDisponibilidad(index)}
                              title="Quitar regla"
                              disabled={guardando}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>

                          <div className="gm-scheduleGrid gm-scheduleGrid--rules">
                            <label className="gm-field">
                              <select
                                className="gm-input gm-select"
                                value={bloque.id_dia_semana || ''}
                                onChange={(e) => actualizarDisponibilidad(index, 'id_dia_semana', e.target.value)}
                                disabled={guardando}
                              >
                                <option value="">Sin día semanal</option>
                                {diasSemana.map((dia) => (
                                  <option key={dia.id_dia_semana} value={dia.id_dia_semana}>
                                    {dia.dia_semana}
                                  </option>
                                ))}
                              </select>
                              <span className={`gm-label${bloque.id_dia_semana ? ' is-up' : ''}`}>
                                Día semanal
                              </span>
                            </label>

                            <label className="gm-field">
                              <select
                                className="gm-input gm-select"
                                value={bloque.id_turno || ''}
                                onChange={(e) => actualizarDisponibilidad(index, 'id_turno', e.target.value)}
                                disabled={guardando}
                              >
                                <option value="">Sin turno</option>
                                {(catalogos?.turnos || []).map((turno) => (
                                  <option key={turno.id_turno} value={turno.id_turno}>
                                    {turno.turno}
                                  </option>
                                ))}
                              </select>
                              <span className={`gm-label${bloque.id_turno ? ' is-up' : ''}`}>
                                Turno
                              </span>
                            </label>

                            <label
                              className="gm-field gm-field--date"
                              onClick={intentarAbrirSelectorFecha}
                            >
                              <input
                                className="gm-input"
                                type="date"
                                value={bloque.fecha || ''}
                                onChange={(e) => actualizarDisponibilidad(index, 'fecha', e.target.value)}
                                disabled={guardando}
                              />
                              <span className={`gm-label${bloque.fecha ? ' is-up' : ''}`}>
                                Fecha puntual
                              </span>
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* FOOTER ACTIONS */}
          <div className="gm-modal__actions">
            <button
              type="button"
              className="gm-btn gm-btn--ghost"
              onClick={onCerrar}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="gm-btn gm-btn--primary"
              disabled={guardando}
            >
              <FontAwesomeIcon icon={faSave} />{' '}
              {guardando ? 'Guardando...' : 'Guardar docente'}
            </button>
          </div>
        </form>

        {mostrarTutorial && (
          <ModalTutorialGlobal
            titulo="Cómo configurar indisponibilidades"
            descripcion="Usá las reglas para indicar cuándo el docente no puede ser asignado."
            onCerrar={() => setMostrarTutorial(false)}
          >
            <ul className="gm-tutorialList">
              <li>
                <strong>Solo Turno</strong>
                <span>(dejar la fecha vacía): nunca puede en ese turno (máximo uno).</span>
              </li>
              <li>
                <strong>Solo Fecha</strong>
                <span>(dejar turno en blanco): no puede en todo ese día.</span>
              </li>
              <li>
                <strong>Turno + Fecha</strong>
                <span>no puede en ese turno ese día.</span>
              </li>
              <li>
                <strong>Hasta {MAX_REGLAS_DISPONIBILIDAD} reglas</strong>
                <span>los slots vacíos se ignoran.</span>
              </li>
            </ul>
          </ModalTutorialGlobal>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}