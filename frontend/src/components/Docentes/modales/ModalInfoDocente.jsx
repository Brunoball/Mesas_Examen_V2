import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faCalendarDays,
  faChalkboardTeacher,
  faInfoCircle,
  faTimes,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';

function formatearFecha(fecha) {
  if (!fecha) return '-';
  const [y, m, d] = String(fecha).split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

export default function ModalInfoDocente({ item, onCerrar }) {
  const catedras = Array.isArray(item?.catedras) ? item.catedras : [];
  const bloques = Array.isArray(item?.indisponibilidades) ? item.indisponibilidades : [];

  return (
    <div className="docentes-modal-overlay" role="dialog" aria-modal="true">
      <div className="docentes-modal docentes-modal-xl">
        <div className="docentes-modal-header">
          <div>
            <h2><FontAwesomeIcon icon={faInfoCircle} /> Información del docente</h2>
            <p>Datos, cátedras asignadas e indisponibilidad cargada.</p>
          </div>
          <button type="button" className="docentes-modal-close" onClick={onCerrar}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="docentes-info-head">
          <div className="docentes-info-icon"><FontAwesomeIcon icon={faUserTie} /></div>
          <div>
            <h3>{item?.docente || 'Docente'}</h3>
            <p>{item?.cargo || 'Sin cargo'} · {Number(item?.activo) === 1 ? 'Activo' : 'Dado de baja'}</p>
            {item?.observacion && <small>{item.observacion}</small>}
          </div>
        </div>

        <div className="docentes-info-grid">
          <div className="docentes-info-card">
            <span>Registros internos</span>
            <strong>{item?.cantidad_registros || item?.ids_docentes?.length || 1}</strong>
          </div>
          <div className="docentes-info-card">
            <span>Cátedras asignadas</span>
            <strong>{catedras.length}</strong>
          </div>
          <div className="docentes-info-card">
            <span>Indisponibilidades</span>
            <strong>{bloques.length}</strong>
          </div>
        </div>

        <section className="docentes-info-section">
          <h3><FontAwesomeIcon icon={faChalkboardTeacher} /> Materias, cursos y divisiones</h3>

          <div className="docentes-info-table-wrap">
            <table className="docentes-info-table">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>División</th>
                  <th>Materia</th>
                </tr>
              </thead>
              <tbody>
                {catedras.length === 0 && (
                  <tr><td colSpan="3" className="docentes-empty">No tiene cátedras asignadas.</td></tr>
                )}
                {catedras.map((cat) => (
                  <tr key={cat.id_catedra}>
                    <td><span className="docentes-badge">{cat.nombre_curso}</span></td>
                    <td><span className="docentes-badge docentes-badge-soft">{cat.nombre_division}</span></td>
                    <td><FontAwesomeIcon icon={faBookOpen} /> {cat.materia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="docentes-info-section">
          <h3><FontAwesomeIcon icon={faCalendarDays} /> Días y turnos que no puede</h3>

          <div className="docentes-bloques-lista">
            {bloques.length === 0 && <div className="docentes-empty-small">Sin indisponibilidades cargadas.</div>}
            {bloques.map((bloque, index) => (
              <div className="docentes-bloque-chip" key={`${bloque.fecha}-${bloque.id_turno || 'todos'}-${index}`}>
                <strong>{formatearFecha(bloque.fecha)}</strong>
                <span>{bloque.turno || 'TODOS'}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="docentes-modal-actions">
          <button type="button" className="docentes-btn docentes-btn-primary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
