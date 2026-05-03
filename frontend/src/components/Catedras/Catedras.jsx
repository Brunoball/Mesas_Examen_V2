import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faChalkboardTeacher,
  faFilter,
  faRotateRight,
  faSearch,
  faUserPen,
} from '@fortawesome/free-solid-svg-icons';
import { useCatedras } from './hooks/useCatedras';
import ModalAsignarDocente from './modales/ModalAsignarDocente';
import './Catedras.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

export default function Catedras() {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);
  const {
    catedras,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    filtros,
    actualizarFiltro,
    limpiarTodosFiltros,
    paginacion,
    reload,
    asignarDocente,
  } = useCatedras();

  const [modalAsignar, setModalAsignar] = useState({ abierto: false, item: null });

  function abrirModalAsignar(item) {
    setModalAsignar({ abierto: true, item });
  }

  function cerrarModalAsignar() {
    setModalAsignar({ abierto: false, item: null });
  }

  async function handleAsignarDocente(idCatedra, idDocente) {
    const res = await asignarDocente(idCatedra, idDocente);
    if (res.ok) cerrarModalAsignar();
    return res;
  }

  const contenido = (
    <div className="catedras-page">
      <div className="catedras-card">
        <div className="catedras-header">
          <div>
            <button type="button" className="catedras-back" onClick={() => navigate('/panel')}>
              <FontAwesomeIcon icon={faArrowLeft} /> Volver
            </button>
            <h1>
              <FontAwesomeIcon icon={faChalkboardTeacher} /> Cátedras
            </h1>
            <p>
              Consultá las materias por curso y división, y asigná el docente correspondiente.
            </p>
          </div>

          <button type="button" className="catedras-btn catedras-btn-primary" onClick={reload} disabled={loading}>
            <FontAwesomeIcon icon={faRotateRight} /> Actualizar
          </button>
        </div>

        <div className="catedras-toolbar">
          <div className="catedras-search">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por materia, docente, curso o división..."
            />
          </div>

          <div className="catedras-filtros">
            <span className="catedras-filter-label">
              <FontAwesomeIcon icon={faFilter} /> Filtros
            </span>

            <select value={filtros.id_curso} onChange={(e) => actualizarFiltro('id_curso', e.target.value)}>
              <option value="">Todos los cursos</option>
              {catalogos.cursos.map((curso) => (
                <option key={curso.id_curso} value={curso.id_curso}>{curso.nombre_curso}</option>
              ))}
            </select>

            <select value={filtros.id_division} onChange={(e) => actualizarFiltro('id_division', e.target.value)}>
              <option value="">Todas las divisiones</option>
              {catalogos.divisiones.map((division) => (
                <option key={division.id_division} value={division.id_division}>{division.nombre_division}</option>
              ))}
            </select>

            <select value={filtros.sin_docente} onChange={(e) => actualizarFiltro('sin_docente', e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Solo sin docente</option>
            </select>

            <button type="button" className="catedras-btn catedras-btn-light" onClick={limpiarTodosFiltros}>
              Limpiar
            </button>
          </div>
        </div>

        {mensaje && (
          <div className={`catedras-alerta ${mensaje.tipo === 'success' ? 'catedras-alerta-success' : 'catedras-alerta-error'}`}>
            {mensaje.texto}
          </div>
        )}

        {error && <div className="catedras-alerta catedras-alerta-error">{error}</div>}

        <div className="catedras-table-wrap">
          <table className="catedras-table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>División</th>
                <th>Materia</th>
                <th>Docente</th>
                <th>Cargo</th>
                <th className="catedras-th-actions">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="catedras-empty">Cargando cátedras...</td>
                </tr>
              )}

              {!loading && catedras.length === 0 && (
                <tr>
                  <td colSpan="6" className="catedras-empty">No se encontraron cátedras.</td>
                </tr>
              )}

              {!loading && catedras.map((item) => (
                <tr key={item.id_catedra}>
                  <td><span className="catedras-badge">{item.nombre_curso}</span></td>
                  <td><span className="catedras-badge catedras-badge-soft">{item.nombre_division}</span></td>
                  <td className="catedras-materia">{item.materia}</td>
                  <td>
                    {item.docente ? (
                      <strong>{item.docente}</strong>
                    ) : (
                      <span className="catedras-sin-docente">Sin docente</span>
                    )}
                  </td>
                  <td>{item.cargo_docente || '-'}</td>
                  <td className="catedras-actions">
                    <button
                      type="button"
                      className="catedras-action-btn"
                      onClick={() => abrirModalAsignar(item)}
                      title="Asignar docente"
                    >
                      <FontAwesomeIcon icon={faUserPen} />
                      <span>Asignar</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="catedras-footer">
          <span>
            Registros: <strong>{paginacion.totalRegistros}</strong>
          </span>

          <div className="catedras-pagination">
            <button
              type="button"
              className="catedras-btn catedras-btn-light"
              disabled={paginacion.pagina <= 1 || loading}
              onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <span>Página {paginacion.pagina} / {paginacion.totalPaginas}</span>

            <button
              type="button"
              className="catedras-btn catedras-btn-light"
              disabled={paginacion.pagina >= paginacion.totalPaginas || loading}
              onClick={() => paginacion.setPagina((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {modalAsignar.abierto && (
        <ModalAsignarDocente
          item={modalAsignar.item}
          docentes={catalogos.docentes}
          onGuardar={handleAsignarDocente}
          onCerrar={cerrarModalAsignar}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
