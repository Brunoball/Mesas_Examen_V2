import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChalkboardTeacher, faSearch, faTimes, faSave, faUserSlash } from '@fortawesome/free-solid-svg-icons';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ModalAsignarDocente({ item, docentes = [], onGuardar, onCerrar }) {
  const [idDocente, setIdDocente] = useState(item?.id_docente ? String(item.id_docente) : '');
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCerrar();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const docentesFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return docentes;

    return docentes.filter((docente) => (
      normalizar(docente.docente).includes(q) ||
      normalizar(docente.cargo).includes(q)
    ));
  }, [docentes, busqueda]);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError('');

    const res = await onGuardar(item.id_catedra, idDocente ? Number(idDocente) : 0);

    if (!res.ok) {
      setError(res.mensaje || 'No se pudo asignar el docente.');
      setGuardando(false);
      return;
    }

    setGuardando(false);
  }

  const docenteActual = item?.docente || 'Sin docente asignado';

  return (
    <div className="catedras-modal-overlay" role="dialog" aria-modal="true" onMouseDown={onCerrar}>
      <form className="catedras-modal" onSubmit={handleSubmit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="catedras-modal-header">
          <div>
            <h3>
              <FontAwesomeIcon icon={faChalkboardTeacher} /> Asignar docente
            </h3>
            <p>
              {item?.nombre_curso} {item?.nombre_division} — {item?.materia}
            </p>
          </div>

          <button type="button" className="catedras-btn-icon" onClick={onCerrar} title="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="catedras-docente-actual">
          <span>Docente actual</span>
          <strong>{docenteActual}</strong>
        </div>

        <label className="catedras-label">Buscar docente activo</label>
        <div className="catedras-modal-search">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o cargo..."
            autoFocus
          />
        </div>

        <label className="catedras-label">Docente</label>
        <select
          className="catedras-select"
          value={idDocente}
          onChange={(e) => setIdDocente(e.target.value)}
        >
          <option value="">Sin docente asignado</option>
          {docentesFiltrados.map((docente) => (
            <option key={docente.id_docente} value={docente.id_docente}>
              {docente.docente}{docente.cargo ? ` — ${docente.cargo}` : ''}
            </option>
          ))}
        </select>

        {error && <div className="catedras-alerta catedras-alerta-error">{error}</div>}

        <div className="catedras-modal-actions">
          <button
            type="button"
            className="catedras-btn catedras-btn-secondary"
            onClick={() => setIdDocente('')}
            disabled={guardando}
          >
            <FontAwesomeIcon icon={faUserSlash} /> Quitar docente
          </button>

          <div className="catedras-modal-actions-right">
            <button type="button" className="catedras-btn catedras-btn-light" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="catedras-btn catedras-btn-primary" disabled={guardando}>
              <FontAwesomeIcon icon={faSave} /> {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
