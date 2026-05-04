import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faEdit,
  faPlus,
  faRotateRight,
  faSearch,
  faTrash,
  faUserCheck,
  faUserSlash,
  faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import { usePrevias } from './hooks/usePrevias.js';
import ModalPrevia from './modales/ModalPrevia.jsx';
import ModalConfirmarPrevia from './modales/ModalConfirmarPrevia.jsx';
import './Previas.css';
import Principal, { MesasShellContext } from '../Principal/Principal';

export default function Previas() {
  const navigate = useNavigate();
  const dentroDeShell = useContext(MesasShellContext);

  const {
    previas,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    conteo,
    paginacion,
    reload,
    obtener,
    guardar,
    darBaja,
    darAlta,
    eliminar,
    obtenerMateriasPorCurso,
  } = usePrevias();

  const [modalPrevia, setModalPrevia] = useState({ abierto: false, modo: 'crear', item: null, cargando: false });
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null });

  function abrirCrear() {
    setModalPrevia({ abierto: true, modo: 'crear', item: null, cargando: false });
  }

  async function abrirEditar(item) {
    setModalPrevia({ abierto: true, modo: 'editar', item: null, cargando: true });
    const res = await obtener(item.id_previa);
    if (res.ok) {
      setModalPrevia({ abierto: true, modo: 'editar', item: res.data, cargando: false });
    } else {
      setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false });
    }
  }

  function abrirConfirmar(tipo, item) {
    setModalConfirmar({ abierto: true, tipo, item });
  }

  async function confirmarOperacion(motivo = '') {
    if (modalConfirmar.tipo === 'baja') return darBaja(modalConfirmar.item, motivo);
    if (modalConfirmar.tipo === 'alta') return darAlta(modalConfirmar.item);
    if (modalConfirmar.tipo === 'eliminar') return eliminar(modalConfirmar.item);
    return { ok: false, mensaje: 'Operación inválida.' };
  }

  const contenido = (
    <div className="previas-page">
      <div className="previas-card">
        <div className="previas-header">
          <div>
            <button type="button" className="previas-back" onClick={() => navigate('/panel')}>
              <FontAwesomeIcon icon={faArrowLeft} /> Volver
            </button>
            <h1><FontAwesomeIcon icon={faBookOpen} /> Previas</h1>
            <p>
              Gestioná alumnos con materias previas, condición, inscripción, curso y división real de la materia.
            </p>
          </div>

          <div className="previas-header-actions">
            <button type="button" className="previas-btn previas-btn-light" onClick={reload} disabled={loading}>
              <FontAwesomeIcon icon={faRotateRight} /> Actualizar
            </button>
            <button type="button" className="previas-btn previas-btn-primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} /> Agregar previa
            </button>
          </div>
        </div>

        <div className="previas-tabs">
          <button
            type="button"
            className={`previas-tab ${vista === 'activas' ? 'active' : ''}`}
            onClick={() => cambiarVista('activas')}
          >
            <FontAwesomeIcon icon={faUserCheck} /> Previas activas
          </button>
          <button
            type="button"
            className={`previas-tab ${vista === 'bajas' ? 'active' : ''}`}
            onClick={() => cambiarVista('bajas')}
          >
            <FontAwesomeIcon icon={faUserSlash} /> Dados de baja
          </button>
        </div>

        <div className="previas-toolbar">
          <div className="previas-search">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por alumno, DNI, materia, condición, curso o año..."
            />
          </div>
        </div>

        {mensaje && (
          <div className={`previas-alerta ${mensaje.tipo === 'success' ? 'previas-alerta-success' : 'previas-alerta-error'}`}>
            {mensaje.texto}
          </div>
        )}

        {error && <div className="previas-alerta previas-alerta-error">{error}</div>}

        <div className="previas-table-wrap">
          <table className="previas-table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>DNI</th>
                <th>Materia</th>
                <th>Condición</th>
                <th>Curso</th>
                <th>Inscripción</th>
                <th className="previas-th-actions">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="previas-empty">Cargando previas...</td>
                </tr>
              )}

              {!loading && previas.length === 0 && (
                <tr>
                  <td colSpan="7" className="previas-empty">
                    {vista === 'activas' ? 'No se encontraron previas activas.' : 'No hay previas dadas de baja.'}
                  </td>
                </tr>
              )}

              {!loading && previas.map((item) => (
                <tr key={item.id_previa}>
                  <td>
                    <div className="previas-name-cell">
                      <strong>{item.alumno || '-'}</strong>
                      <small>Actual: {item.curso_cursando || '-'}</small>
                    </div>
                  </td>
                  <td className="previas-dni-cell">{item.dni || '-'}</td>
                  <td>
                    <div className="previas-materia-cell">
                      <strong>{item.materia || '-'}</strong>
                      <small>Año previa: {item.anio || '-'}</small>
                    </div>
                  </td>
                  <td><span className="previas-badge">{item.condicion || '-'}</span></td>
                  <td><span className="previas-badge previas-badge-soft">{item.curso_materia || '-'}</span></td>
                  <td>
                    <span className={`previas-pill ${Number(item.inscripcion) === 1 ? 'previas-pill-ok' : 'previas-pill-muted'}`}>
                      {item.inscripcion_texto || (Number(item.inscripcion) === 1 ? 'Sí' : 'No')}
                    </span>
                  </td>
                  <td className="previas-actions">
                    {vista === 'activas' && (
                      <button type="button" className="previas-icon-btn" onClick={() => abrirEditar(item)} title="Editar previa">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                    )}

                    {vista === 'activas' ? (
                      <button type="button" className="previas-icon-btn previas-icon-warning" onClick={() => abrirConfirmar('baja', item)} title="Dar de baja">
                        <FontAwesomeIcon icon={faUserSlash} />
                      </button>
                    ) : (
                      <button type="button" className="previas-icon-btn previas-icon-success" onClick={() => abrirConfirmar('alta', item)} title="Dar de alta">
                        <FontAwesomeIcon icon={faUserCheck} />
                      </button>
                    )}

                    <button type="button" className="previas-icon-btn previas-icon-danger" onClick={() => abrirConfirmar('eliminar', item)} title="Eliminar previa">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="previas-footer previas-footer-simple">
          <span>
            Registros totales: <strong>{conteo.totalRegistros}</strong>
          </span>

          <span>
            Mostrando: <strong>{conteo.totalPagina}</strong>
          </span>

          {busqueda.trim() !== '' && (
            <span>
              Coincidencias encontradas: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}

          <div className="previas-pagination">
            <button
              type="button"
              className="previas-page-btn"
              disabled={paginacion.pagina <= 1 || loading}
              onClick={() => paginacion.setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <span className="previas-page-info">
              Página <strong>{paginacion.pagina}</strong> / <strong>{paginacion.totalPaginas}</strong>
              <small>100 por página</small>
            </span>

            <button
              type="button"
              className="previas-page-btn"
              disabled={paginacion.pagina >= paginacion.totalPaginas || loading}
              onClick={() => paginacion.setPagina((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>

          <span className="previas-footer-note">
            El buscador consulta en toda la base, no solo en la página cargada.
          </span>
        </div>
      </div>

      {modalPrevia.abierto && modalPrevia.cargando && (
        <div className="previas-modal-overlay">
          <div className="previas-modal previas-modal-sm">
            <div className="previas-empty">Cargando previa...</div>
          </div>
        </div>
      )}

      {modalPrevia.abierto && !modalPrevia.cargando && (
        <ModalPrevia
          modo={modalPrevia.modo}
          item={modalPrevia.item}
          catalogos={catalogos}
          onObtenerMateriasPorCurso={obtenerMateriasPorCurso}
          onGuardar={guardar}
          onCerrar={() => setModalPrevia({ abierto: false, modo: 'crear', item: null, cargando: false })}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalConfirmarPrevia
          tipo={modalConfirmar.tipo}
          item={modalConfirmar.item}
          onConfirmar={confirmarOperacion}
          onCerrar={() => setModalConfirmar({ abierto: false, tipo: '', item: null })}
        />
      )}
    </div>
  );

  return dentroDeShell ? contenido : <Principal>{contenido}</Principal>;
}
