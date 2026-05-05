import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faPlus,
  faSave,
  faTimes,
  faTrash,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';

const DIAS_SEMANA_DEFAULT = [
  { id_dia_semana: 1, dia_semana: 'LUNES' },
  { id_dia_semana: 2, dia_semana: 'MARTES' },
  { id_dia_semana: 3, dia_semana: 'MIÉRCOLES' },
  { id_dia_semana: 4, dia_semana: 'JUEVES' },
  { id_dia_semana: 5, dia_semana: 'VIERNES' },
];

function idsDesdeItem(item) {
  if (Array.isArray(item?.ids_docentes)) return item.ids_docentes.map(Number).filter(Boolean);
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

export default function ModalDocente({ modo = 'crear', item, catalogos, onGuardar, onCerrar }) {
  const [docente, setDocente] = useState('');
  const [idCargo, setIdCargo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [activo, setActivo] = useState(1);
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const editando = modo === 'editar' && item?.id_docente;

  useEffect(() => {
    setDocente(item?.docente || '');
    setIdCargo(item?.id_cargo ? String(item.id_cargo) : '');
    setObservacion(item?.observacion || '');
    setActivo(Number(item?.activo ?? 1));
    setDisponibilidades(
      Array.isArray(item?.disponibilidades)
        ? item.disponibilidades.map(normalizarDisponibilidad)
        : []
    );
  }, [item]);

  const titulo = editando ? 'Editar docente' : 'Agregar docente';
  const diasSemana = Array.isArray(catalogos?.dias_semana) && catalogos.dias_semana.length > 0
    ? catalogos.dias_semana
    : DIAS_SEMANA_DEFAULT;

  const resumenRegistros = useMemo(() => {
    const ids = idsDesdeItem(item);
    if (!editando || ids.length <= 1) return '';
    return `Este docente tiene ${ids.length} registros internos unificados. Se actualizarán juntos para no repetirlo.`;
  }, [editando, item]);

  function agregarDisponibilidad() {
    setDisponibilidades((prev) => [...prev, { id_dia_semana: '', id_turno: '', fecha: '' }]);
  }

  function actualizarDisponibilidad(index, campo, valor) {
    setDisponibilidades((prev) => prev.map((itemBloque, i) => (
      i === index ? { ...itemBloque, [campo]: valor } : itemBloque
    )));
  }

  function eliminarDisponibilidad(index) {
    setDisponibilidades((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!docente.trim()) {
      setError('El nombre del docente es obligatorio.');
      return;
    }

    if (!idCargo) {
      setError('Debe seleccionar un cargo.');
      return;
    }

    const disponibilidadesValidas = disponibilidades
      .filter((bloque) => bloque.id_dia_semana && bloque.id_turno)
      .map((bloque) => ({
        id_dia_semana: Number(bloque.id_dia_semana),
        id_turno: Number(bloque.id_turno),
        fecha: bloque.fecha || null,
      }));

    setGuardando(true);
    const res = await onGuardar({
      id_docente: item?.id_docente || 0,
      ids_docentes: idsDesdeItem(item),
      docente: docente.trim(),
      id_cargo: Number(idCargo),
      observacion: observacion.trim(),
      activo,
      disponibilidades: disponibilidadesValidas,
    });
    setGuardando(false);

    if (res.ok) {
      onCerrar();
    } else {
      setError(res.mensaje || 'No se pudo guardar el docente.');
    }
  }

  return (
    <div className="docentes-modal-overlay" role="dialog" aria-modal="true">
      <div className="docentes-modal docentes-modal-lg">
        <div className="docentes-modal-header">
          <div>
            <h2><FontAwesomeIcon icon={faUserTie} /> {titulo}</h2>
            <p>Datos principales del docente y días en los que asiste a la escuela.</p>
          </div>
          <button type="button" className="docentes-modal-close" onClick={onCerrar}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="docentes-form">
          {error && <div className="docentes-alerta docentes-alerta-error">{error}</div>}
          {resumenRegistros && <div className="docentes-alerta docentes-alerta-info">{resumenRegistros}</div>}

          <div className="docentes-form-grid">
            <label className="docentes-label">
              Nombre y apellido
              <input
                type="text"
                value={docente}
                onChange={(e) => setDocente(e.target.value.toUpperCase())}
                placeholder="Ej: PÉREZ, JUAN"
                autoFocus
              />
            </label>

            <label className="docentes-label">
              Cargo
              <select value={idCargo} onChange={(e) => setIdCargo(e.target.value)}>
                <option value="">Seleccionar cargo</option>
                {(catalogos.cargos || []).map((cargo) => (
                  <option key={cargo.id_cargo} value={cargo.id_cargo}>{cargo.cargo}</option>
                ))}
              </select>
            </label>

            <label className="docentes-label docentes-label-full">
              Observación
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Observación opcional, motivo de baja, licencia, etc."
                rows={3}
              />
            </label>
          </div>

          <section className="docentes-bloques-box">
            <div className="docentes-bloques-header">
              <div>
                <h3><FontAwesomeIcon icon={faCalendarDays} /> Disponibilidad del docente</h3>
                <p>Agregá los días de lunes a viernes y el turno en el que el docente va a la escuela.</p>
              </div>
              <button type="button" className="docentes-btn docentes-btn-light" onClick={agregarDisponibilidad}>
                <FontAwesomeIcon icon={faPlus} /> Agregar día
              </button>
            </div>

            {disponibilidades.length === 0 && (
              <div className="docentes-empty-small">Sin disponibilidad cargada.</div>
            )}

            {disponibilidades.map((bloque, index) => (
              <div className="docentes-bloque-row" key={`${bloque.id_dia_semana}-${bloque.id_turno}-${bloque.fecha}-${index}`}>
                <label>
                  Día
                  <select
                    value={bloque.id_dia_semana || ''}
                    onChange={(e) => actualizarDisponibilidad(index, 'id_dia_semana', e.target.value)}
                  >
                    <option value="">Seleccionar día</option>
                    {diasSemana.map((dia) => (
                      <option key={dia.id_dia_semana} value={dia.id_dia_semana}>{dia.dia_semana}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Turno
                  <select
                    value={bloque.id_turno || ''}
                    onChange={(e) => actualizarDisponibilidad(index, 'id_turno', e.target.value)}
                  >
                    <option value="">Seleccionar turno</option>
                    {(catalogos.turnos || []).map((turno) => (
                      <option key={turno.id_turno} value={turno.id_turno}>{turno.turno}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Fecha puntual opcional
                  <input
                    type="date"
                    value={bloque.fecha || ''}
                    onChange={(e) => actualizarDisponibilidad(index, 'fecha', e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className="docentes-icon-btn docentes-icon-danger"
                  onClick={() => eliminarDisponibilidad(index)}
                  title="Quitar disponibilidad"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </section>

          <div className="docentes-modal-actions">
            <button type="button" className="docentes-btn docentes-btn-light" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="docentes-btn docentes-btn-primary" disabled={guardando}>
              <FontAwesomeIcon icon={faSave} /> {guardando ? 'Guardando...' : 'Guardar docente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
