import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faInfoCircle,
  faEdit,
  faPlus,
  faRotateRight,
  faSearch,
  faTrash,
  faUserCheck,
  faUserSlash,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import { useDocentes } from './hooks/useDocentes.js';
import ModalDocente from './modales/ModalDocente.jsx';
import ModalInfoDocente from './modales/ModalInfoDocente.jsx';
import ModalConfirmarDocente from './modales/ModalConfirmarDocente.jsx';
import './Docentes.css';

export default function Docentes() {
  const navigate = useNavigate();
  const {
    docentes,
    catalogos,
    loading,
    error,
    mensaje,
    busqueda,
    setBusqueda,
    vista,
    cambiarVista,
    conteo,
    reload,
    obtener,
    guardar,
    darBaja,
    darAlta,
    eliminar,
  } = useDocentes();

  const [modalDocente, setModalDocente] = useState({ abierto: false, modo: 'crear', item: null });
  const [modalInfo, setModalInfo] = useState({ abierto: false, item: null, cargando: false });
  const [modalConfirmar, setModalConfirmar] = useState({ abierto: false, tipo: '', item: null });

  function abrirCrear() {
    setModalDocente({ abierto: true, modo: 'crear', item: null });
  }

  async function abrirEditar(item) {
    const res = await obtener(item.id_docente);
    if (res.ok) {
      setModalDocente({ abierto: true, modo: 'editar', item: res.data });
    }
  }

  async function abrirInfo(item) {
    setModalInfo({ abierto: true, item: null, cargando: true });
    const res = await obtener(item.id_docente);
    if (res.ok) {
      setModalInfo({ abierto: true, item: res.data, cargando: false });
    } else {
      setModalInfo({ abierto: false, item: null, cargando: false });
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

  return (
    <div className="docentes-page">
      <div className="docentes-card">
        <div className="docentes-header">
          <div>
            <button type="button" className="docentes-back" onClick={() => navigate('/panel')}>
              <FontAwesomeIcon icon={faArrowLeft} /> Volver
            </button>
            <h1><FontAwesomeIcon icon={faUserTie} /> Docentes</h1>
            <p>
              Gestioná docentes sin repetir, altas, bajas, cátedras asignadas e indisponibilidad por día y turno.
            </p>
          </div>

          <div className="docentes-header-actions">
            <button type="button" className="docentes-btn docentes-btn-light" onClick={reload} disabled={loading}>
              <FontAwesomeIcon icon={faRotateRight} /> Actualizar
            </button>
            <button type="button" className="docentes-btn docentes-btn-primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} /> Agregar docente
            </button>
          </div>
        </div>

        <div className="docentes-tabs">
          <button
            type="button"
            className={`docentes-tab ${vista === 'activos' ? 'active' : ''}`}
            onClick={() => cambiarVista('activos')}
          >
            <FontAwesomeIcon icon={faUserCheck} /> Activos
          </button>
          <button
            type="button"
            className={`docentes-tab ${vista === 'bajas' ? 'active' : ''}`}
            onClick={() => cambiarVista('bajas')}
          >
            <FontAwesomeIcon icon={faUserSlash} /> Dados de baja
          </button>
        </div>

        <div className="docentes-toolbar">
          <div className="docentes-search">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por docente, cargo u observación..."
            />
          </div>
        </div>

        {mensaje && (
          <div className={`docentes-alerta ${mensaje.tipo === 'success' ? 'docentes-alerta-success' : 'docentes-alerta-error'}`}>
            {mensaje.texto}
          </div>
        )}

        {error && <div className="docentes-alerta docentes-alerta-error">{error}</div>}

        <div className="docentes-table-wrap">
          <table className="docentes-table">
            <thead>
              <tr>
                <th>Docente</th>
                <th>Cargo</th>
                <th>Cátedras</th>
                <th>No puede</th>
                <th>Observación</th>
                <th className="docentes-th-actions">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="docentes-empty">Cargando docentes...</td>
                </tr>
              )}

              {!loading && docentes.length === 0 && (
                <tr>
                  <td colSpan="6" className="docentes-empty">
                    {vista === 'activos' ? 'No se encontraron docentes activos.' : 'No hay docentes dados de baja.'}
                  </td>
                </tr>
              )}

              {!loading && docentes.map((item) => (
                <tr key={`${item.id_docente}-${item.ids_docentes_texto}`}>
                  <td>
                    <div className="docentes-name-cell">
                      <strong>{item.docente}</strong>
                      {Number(item.cantidad_registros) > 1 && (
                        <small>{item.cantidad_registros} registros unificados</small>
                      )}
                    </div>
                  </td>
                  <td>{item.cargo || '-'}</td>
                  <td><span className="docentes-badge">{item.total_catedras || 0}</span></td>
                  <td><span className="docentes-badge docentes-badge-soft">{item.total_indisponibilidades || 0}</span></td>
                  <td className="docentes-observacion">{item.observacion || '-'}</td>
                  <td className="docentes-actions">
                    <button type="button" className="docentes-icon-btn" onClick={() => abrirInfo(item)} title="Ver información">
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                    <button type="button" className="docentes-icon-btn" onClick={() => abrirEditar(item)} title="Editar docente">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>

                    {vista === 'activos' ? (
                      <button type="button" className="docentes-icon-btn docentes-icon-warning" onClick={() => abrirConfirmar('baja', item)} title="Dar de baja">
                        <FontAwesomeIcon icon={faUserSlash} />
                      </button>
                    ) : (
                      <button type="button" className="docentes-icon-btn docentes-icon-success" onClick={() => abrirConfirmar('alta', item)} title="Dar de alta">
                        <FontAwesomeIcon icon={faUserCheck} />
                      </button>
                    )}

                    <button type="button" className="docentes-icon-btn docentes-icon-danger" onClick={() => abrirConfirmar('eliminar', item)} title="Eliminar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="docentes-footer docentes-footer-simple">
          <span>
            Registros únicos cargados: <strong>{conteo.totalRegistros}</strong>
          </span>

          {busqueda.trim() !== '' && (
            <span>
              Coincidencias visibles: <strong>{conteo.totalFiltrados}</strong>
            </span>
          )}

          <span className="docentes-footer-note">
            El buscador filtra en pantalla sin volver a consultar la API.
          </span>
        </div>
      </div>

      {modalDocente.abierto && (
        <ModalDocente
          modo={modalDocente.modo}
          item={modalDocente.item}
          catalogos={catalogos}
          onGuardar={guardar}
          onCerrar={() => setModalDocente({ abierto: false, modo: 'crear', item: null })}
        />
      )}

      {modalInfo.abierto && modalInfo.cargando && (
        <div className="docentes-modal-overlay">
          <div className="docentes-modal docentes-modal-sm">
            <div className="docentes-empty">Cargando información del docente...</div>
          </div>
        </div>
      )}

      {modalInfo.abierto && modalInfo.item && (
        <ModalInfoDocente
          item={modalInfo.item}
          onCerrar={() => setModalInfo({ abierto: false, item: null, cargando: false })}
        />
      )}

      {modalConfirmar.abierto && (
        <ModalConfirmarDocente
          tipo={modalConfirmar.tipo}
          item={modalConfirmar.item}
          onConfirmar={confirmarOperacion}
          onCerrar={() => setModalConfirmar({ abierto: false, tipo: '', item: null })}
        />
      )}
    </div>
  );
}
