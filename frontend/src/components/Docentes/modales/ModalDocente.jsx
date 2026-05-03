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

function hoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function idsDesdeItem(item) {
  if (Array.isArray(item?.ids_docentes)) return item.ids_docentes.map(Number).filter(Boolean);
  if (item?.ids_docentes_texto) {
    return String(item.ids_docentes_texto).split(',').map(Number).filter(Boolean);
  }
  return item?.id_docente ? [Number(item.id_docente)] : [];
}

export default function ModalDocente({ modo = 'crear', item, catalogos, onGuardar, onCerrar }) {
  const [docente, setDocente] = useState('');
  const [idCargo, setIdCargo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [activo, setActivo] = useState(1);
  const [indisponibilidades, setIndisponibilidades] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const editando = modo === 'editar' && item?.id_docente;

  useEffect(() => {
    setDocente(item?.docente || '');
    setIdCargo(item?.id_cargo ? String(item.id_cargo) : '');
    setObservacion(item?.observacion || '');
    setActivo(Number(item?.activo ?? 1));
    setIndisponibilidades(
      Array.isArray(item?.indisponibilidades)
        ? item.indisponibilidades.map((bloque) => ({
            fecha: bloque.fecha || '',
            id_turno: bloque.id_turno ? String(bloque.id_turno) : '',
          }))
        : []
    );
  }, [item]);

  const titulo = editando ? 'Editar docente' : 'Agregar docente';

  const resumenRegistros = useMemo(() => {
    const ids = idsDesdeItem(item);
    if (!editando || ids.length <= 1) return '';
    return `Este docente tiene ${ids.length} registros internos unificados. Se actualizarán juntos para no repetirlo.`;
  }, [editando, item]);

  function agregarIndisponibilidad() {
    setIndisponibilidades((prev) => [...prev, { fecha: hoyISO(), id_turno: '' }]);
  }

  function actualizarIndisponibilidad(index, campo, valor) {
    setIndisponibilidades((prev) => prev.map((itemBloque, i) => (
      i === index ? { ...itemBloque, [campo]: valor } : itemBloque
    )));
  }

  function eliminarIndisponibilidad(index) {
    setIndisponibilidades((prev) => prev.filter((_, i) => i !== index));
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

    const bloquesValidos = indisponibilidades
      .filter((bloque) => bloque.fecha)
      .map((bloque) => ({
        fecha: bloque.fecha,
        id_turno: bloque.id_turno ? Number(bloque.id_turno) : null,
      }));

    setGuardando(true);
    const res = await onGuardar({
      id_docente: item?.id_docente || 0,
      ids_docentes: idsDesdeItem(item),
      docente: docente.trim(),
      id_cargo: Number(idCargo),
      observacion: observacion.trim(),
      activo,
      indisponibilidades: bloquesValidos,
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
            <p>Datos principales del docente e indisponibilidad para el armado de mesas.</p>
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
                <h3><FontAwesomeIcon icon={faCalendarDays} /> Indisponibilidad</h3>
                <p>Agregá las fechas y turnos en los que el docente no puede estar en mesas.</p>
              </div>
              <button type="button" className="docentes-btn docentes-btn-light" onClick={agregarIndisponibilidad}>
                <FontAwesomeIcon icon={faPlus} /> Agregar día
              </button>
            </div>

            {indisponibilidades.length === 0 && (
              <div className="docentes-empty-small">Sin indisponibilidades cargadas.</div>
            )}

            {indisponibilidades.map((bloque, index) => (
              <div className="docentes-bloque-row" key={`${bloque.fecha}-${index}`}>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={bloque.fecha}
                    onChange={(e) => actualizarIndisponibilidad(index, 'fecha', e.target.value)}
                  />
                </label>

                <label>
                  Turno
                  <select
                    value={bloque.id_turno || ''}
                    onChange={(e) => actualizarIndisponibilidad(index, 'id_turno', e.target.value)}
                  >
                    <option value="">Todos los turnos</option>
                    {(catalogos.turnos || []).map((turno) => (
                      <option key={turno.id_turno} value={turno.id_turno}>{turno.turno}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="docentes-icon-btn docentes-icon-danger"
                  onClick={() => eliminarIndisponibilidad(index)}
                  title="Quitar indisponibilidad"
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
