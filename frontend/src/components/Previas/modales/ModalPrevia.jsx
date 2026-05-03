import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBookOpen,
  faEdit,
  faPlus,
  faSave,
  faTimes,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';

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
    <label className="previas-field previas-field-select">
      <span>{label}</span>
      <select value={value ?? ''} onChange={onChange} disabled={disabled}>
        {children}
      </select>
    </label>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text', disabled = false }) {
  return (
    <label className="previas-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
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
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

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

  return (
    <div className="previas-modal-overlay previas-modal-overlay-full" role="dialog" aria-modal="true">
      <div className="previas-form-shell">
        <header className="previas-form-hero">
          <div className="previas-form-title">
            <FontAwesomeIcon icon={editando ? faEdit : faBookOpen} />
            <div>
              <h2>{titulo}</h2>
              <p>{subtitulo}</p>
            </div>
          </div>

          <button type="button" className="previas-back-btn" onClick={onCerrar}>
            <FontAwesomeIcon icon={faArrowLeft} /> Volver
          </button>
        </header>

        <div className="previas-form-body">
          {!editando && (
            <div className="previas-form-tabs">
              <button
                type="button"
                className={`previas-form-tab ${tabPrincipal === 'alumno' ? 'active' : ''}`}
                onClick={() => setTabPrincipal('alumno')}
              >
                Datos del alumno
              </button>
              <button
                type="button"
                className={`previas-form-tab ${tabPrincipal === 'materias' ? 'active' : ''}`}
                onClick={() => setTabPrincipal('materias')}
              >
                Materias previas
              </button>
            </div>
          )}

          {(editando || tabPrincipal === 'alumno') && (
            <div className={`previas-form-grid ${editando ? 'previas-form-grid-edit' : ''}`}>
              <section className="previas-form-card">
                <h3>Datos del alumno</h3>
                <div className="previas-section-line" />
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
              </section>

              <section className="previas-form-card">
                <h3>{editando ? 'Cursado' : 'Cursado Actual'}</h3>
                <div className="previas-section-line" />
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

                {editando && materiaActual && (
                  <>
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
                    {errorMateriasActuales && <div className="previas-alerta previas-alerta-error previas-form-error">{errorMateriasActuales}</div>}
                  </>
                )}
              </section>

              {editando && materiaActual && (
                <section className="previas-form-card">
                  <h3>Administrativo</h3>
                  <div className="previas-section-line" />
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
                  <SelectField
                    label="Inscripción"
                    value={materiaActual.inscripcion}
                    onChange={(e) => actualizarMateria(tabMateria, 'inscripcion', e.target.value)}
                  >
                    <option value="0">No</option>
                    <option value="1">Sí</option>
                  </SelectField>
                </section>
              )}
            </div>
          )}

          {!editando && tabPrincipal === 'materias' && (
            <>
              <div className="previas-materia-tabs">
                {materias.map((m, index) => (
                  <button
                    key={m.uid}
                    type="button"
                    className={`previas-materia-tab ${tabMateria === index ? 'active' : ''}`}
                    onClick={() => setTabMateria(index)}
                  >
                    Materia {index + 1}
                  </button>
                ))}

                <button type="button" className="previas-materia-tab previas-materia-tab-add" onClick={agregarMateria}>
                  <FontAwesomeIcon icon={faPlus} /> Otra
                </button>
              </div>

              {materiaActual && (
                <div className="previas-form-grid previas-form-grid-two">
                  <section className="previas-form-card">
                    <div className="previas-card-title-row">
                      <div>
                        <h3>Materia Previa (Materia {tabMateria + 1})</h3>
                        <div className="previas-section-line" />
                      </div>

                      {materias.length > 1 && (
                        <button type="button" className="previas-mini-danger" onClick={() => quitarMateria(tabMateria)}>
                          <FontAwesomeIcon icon={faTrash} /> Quitar
                        </button>
                      )}
                    </div>

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
                    {errorMateriasActuales && <div className="previas-alerta previas-alerta-error previas-form-error">{errorMateriasActuales}</div>}
                  </section>

                  <section className="previas-form-card">
                    <h3>Administrativo</h3>
                    <div className="previas-section-line" />
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
                      label="Inscripción (solo PREVIA)"
                      value={materiaActual.inscripcion}
                      onChange={(e) => actualizarMateria(tabMateria, 'inscripcion', e.target.value)}
                    >
                      <option value="0">No</option>
                      <option value="1">Sí</option>
                    </SelectField>
                  </section>
                </div>
              )}
            </>
          )}

          {error && <div className="previas-alerta previas-alerta-error previas-form-error">{error}</div>}

          <div className="previas-form-footer">
            {!editando && tabPrincipal === 'alumno' ? (
              <button type="button" className="previas-btn previas-btn-primary" onClick={() => setTabPrincipal('materias')}>
                Continuar a materias
              </button>
            ) : (
              <button type="button" className="previas-btn previas-btn-primary" onClick={guardar} disabled={guardando}>
                <FontAwesomeIcon icon={faSave} />
                {guardando ? 'Guardando...' : editando ? 'Guardar Cambios' : `Guardar ${materias.length === 1 ? 'Previa' : `${materias.length} Previas`}`}
              </button>
            )}

            <button type="button" className="previas-btn previas-btn-light" onClick={onCerrar} disabled={guardando}>
              <FontAwesomeIcon icon={faTimes} /> Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
