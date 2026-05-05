import React, { useContext, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarCheck,
  faCheck,
  faRotateRight,
  faSearch,
  faTimes,
  faUserTie,
  faUsers,
  faSave,
  faEraser,
  faClipboardList,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import '../Global/Global_css/roots.css';
import '../Global/Global_css/Global_Section.css';
import '../Global/Toast.css';
import './DisponibilidadDocentes.css';
import Principal, { MesasShellContext } from '../Principal/Principal';
import Toast from '../Global/Toast.jsx';
import { useDisponibilidadDocentes } from './hooks/useDisponibilidadDocentes.js';

function textoSeguro(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function iniciales(nombre = '') {
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'D';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0] || ''}${partes[1][0] || ''}`.toUpperCase();
}

function formatearChips(disponibilidades = [], dias = [], turnos = []) {
  const diaMap = new Map(dias.map((d) => [Number(d.dia_semana), d.nombre]));
  const turnoMap = new Map(turnos.map((t) => [Number(t.id_turno), t.turno]));
  return disponibilidades
    .filter((item) => !item.fecha)
    .map((item) => ({
      id: item.id_disponibilidad,
      texto: `${diaMap.get(Number(item.dia_semana)) || item.dia_nombre || item.dia_semana} · ${turnoMap.get(Number(item.id_turno)) || item.turno || item.id_turno}`,
    }));
}

function DisponibilidadDocentesContenido() {
  const {
    docentesFiltrados,
    turnos,
    dias,
    estadisticas,
    docenteSeleccionado,
    detalleDocente,
    seleccion,
    busqueda,
    soloConCarga,
    loading,
    guardando,
    error,
    mensaje,
    setBusqueda,
    setSoloConCarga,
    seleccionarDocente,
    toggleBloque,
    marcarTodos,
    desmarcarTodos,
    guardar,
    limpiarDocente,
    recargar,
  } = useDisponibilidadDocentes();

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, texto) => setToast({ tipo, mensaje: texto, duracion: tipo === 'error' ? 5500 : 3200 });

  const chipsDetalle = useMemo(
    () => formatearChips(detalleDocente?.disponibilidades || [], dias, turnos),
    [detalleDocente?.disponibilidades, dias, turnos]
  );

  async function guardarConToast() {
    const ok = await guardar();
    if (ok) mostrarToast('exito', 'Disponibilidad guardada correctamente.');
  }

  async function limpiarConToast() {
    const confirmar = window.confirm('¿Seguro que querés limpiar todos los días y turnos de este docente?');
    if (!confirmar) return;
    const ok = await limpiarDocente();
    if (ok) mostrarToast('exito', 'Disponibilidad limpiada correctamente.');
  }

  return (
    <section className="disp-page">
      <header className="disp-hero">
        <div>
          <span className="disp-eyebrow">
            <FontAwesomeIcon icon={faCalendarCheck} />
            Subsistema de dirección
          </span>
          <h1>Disponibilidad docente</h1>
          <p>
            Cargá qué día y turno puede asistir cada docente. Esta información queda lista para que el armado de mesas pueda priorizar la disponibilidad real de los docentes.
          </p>
        </div>

        <div className="disp-hero__actions">
          <button type="button" className="disp-btn disp-btn--ghost" onClick={() => recargar(true)} disabled={loading || guardando}>
            <FontAwesomeIcon icon={faRotateRight} />
            Actualizar
          </button>
          <button type="button" className="disp-btn disp-btn--primary" onClick={guardarConToast} disabled={loading || guardando || !docenteSeleccionado}>
            <FontAwesomeIcon icon={faSave} />
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </header>

      <div className="disp-stats">
        <article className="disp-statCard">
          <div className="disp-statCard__icon"><FontAwesomeIcon icon={faUsers} /></div>
          <div>
            <strong>{estadisticas?.docentes_activos ?? '—'}</strong>
            <span>Docentes activos</span>
          </div>
        </article>
        <article className="disp-statCard">
          <div className="disp-statCard__icon"><FontAwesomeIcon icon={faCheck} /></div>
          <div>
            <strong>{estadisticas?.docentes_con_disponibilidad ?? '—'}</strong>
            <span>Con disponibilidad cargada</span>
          </div>
        </article>
        <article className="disp-statCard">
          <div className="disp-statCard__icon"><FontAwesomeIcon icon={faClipboardList} /></div>
          <div>
            <strong>{estadisticas?.bloques_cargados ?? '—'}</strong>
            <span>Bloques cargados</span>
          </div>
        </article>
        <article className="disp-statCard disp-statCard--future">
          <div className="disp-statCard__icon"><FontAwesomeIcon icon={faWandMagicSparkles} /></div>
          <div>
            <strong>OCR + IA</strong>
            <span>Preparado para automatizar más adelante</span>
          </div>
        </article>
      </div>

      {(error || mensaje) && (
        <div className={`disp-alert ${error ? 'is-error' : 'is-ok'}`}>
          {error || mensaje}
        </div>
      )}

      <div className="disp-layout">
        <aside className="disp-panel disp-panel--docentes">
          <div className="disp-panel__head">
            <div>
              <h2>Docentes</h2>
              <p>Seleccioná un docente para cargar su disponibilidad.</p>
            </div>
          </div>

          <div className="disp-searchBox">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar docente o cargo..."
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>

          <label className="disp-checkLine">
            <input
              type="checkbox"
              checked={soloConCarga}
              onChange={(e) => setSoloConCarga(e.target.checked)}
            />
            Mostrar solo docentes con disponibilidad cargada
          </label>

          <div className="disp-docentesList">
            {loading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <div key={`skel-${index}`} className="disp-docenteItem is-skeleton" />
              ))
            ) : docentesFiltrados.length === 0 ? (
              <div className="disp-emptySmall">No se encontraron docentes.</div>
            ) : (
              docentesFiltrados.map((docente) => {
                const activo = Number(docenteSeleccionado?.id_docente) === Number(docente.id_docente);
                return (
                  <button
                    type="button"
                    key={docente.id_docente}
                    className={`disp-docenteItem ${activo ? 'is-active' : ''}`}
                    onClick={() => seleccionarDocente(docente)}
                  >
                    <span className="disp-avatar">{iniciales(docente.docente)}</span>
                    <span className="disp-docenteItem__text">
                      <strong>{textoSeguro(docente.docente)}</strong>
                      <small>{textoSeguro(docente.cargo)} · {Number(docente.total_disponibilidades || 0)} bloques</small>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="disp-panel disp-panel--matriz">
          <div className="disp-panel__head disp-panel__head--matriz">
            <div>
              <span className="disp-kicker"><FontAwesomeIcon icon={faUserTie} /> Docente seleccionado</span>
              <h2>{textoSeguro(docenteSeleccionado?.docente)}</h2>
              <p>{textoSeguro(docenteSeleccionado?.cargo)} · Marcá los días y turnos disponibles.</p>
            </div>
            <div className="disp-miniActions">
              <button type="button" className="disp-btn disp-btn--light" onClick={marcarTodos} disabled={!docenteSeleccionado || guardando}>
                Marcar todo
              </button>
              <button type="button" className="disp-btn disp-btn--light" onClick={desmarcarTodos} disabled={!docenteSeleccionado || guardando}>
                Desmarcar todo
              </button>
              <button type="button" className="disp-btn disp-btn--dangerGhost" onClick={limpiarConToast} disabled={!docenteSeleccionado || guardando}>
                <FontAwesomeIcon icon={faEraser} />
                Limpiar
              </button>
            </div>
          </div>

          <div className="disp-matrixWrap">
            <table className="disp-matrix">
              <thead>
                <tr>
                  <th>Día</th>
                  {turnos.map((turno) => (
                    <th key={turno.id_turno}>{turno.turno}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dias.map((dia) => (
                  <tr key={dia.dia_semana}>
                    <td>
                      <strong>{dia.nombre}</strong>
                    </td>
                    {turnos.map((turno) => {
                      const key = `${Number(dia.dia_semana)}-${Number(turno.id_turno)}`;
                      const checked = seleccion.has(key);
                      return (
                        <td key={key}>
                          <button
                            type="button"
                            className={`disp-toggle ${checked ? 'is-on' : ''}`}
                            onClick={() => toggleBloque(dia.dia_semana, turno.id_turno)}
                            disabled={!docenteSeleccionado || guardando}
                            aria-pressed={checked}
                          >
                            {checked ? <FontAwesomeIcon icon={faCheck} /> : <span />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="disp-resumenBox">
            <div>
              <h3>Resumen actual</h3>
              <p>Estos son los bloques semanales guardados para el docente.</p>
            </div>
            <div className="disp-chipList">
              {chipsDetalle.length === 0 ? (
                <span className="disp-chip disp-chip--empty">Sin disponibilidad cargada</span>
              ) : (
                chipsDetalle.map((chip) => <span className="disp-chip" key={chip.id || chip.texto}>{chip.texto}</span>)
              )}
            </div>
          </div>

          <div className="disp-saveBar">
            <span>{seleccion.size} bloque{seleccion.size === 1 ? '' : 's'} seleccionado{seleccion.size === 1 ? '' : 's'} para guardar</span>
            <button type="button" className="disp-btn disp-btn--primary" onClick={guardarConToast} disabled={!docenteSeleccionado || guardando}>
              <FontAwesomeIcon icon={faSave} />
              {guardando ? 'Guardando...' : 'Guardar disponibilidad'}
            </button>
          </div>
        </main>
      </div>

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}

export default function DisponibilidadDocentes() {
  const dentroDeShell = useContext(MesasShellContext);

  if (dentroDeShell) {
    return <DisponibilidadDocentesContenido />;
  }

  return (
    <Principal>
      <DisponibilidadDocentesContenido />
    </Principal>
  );
}
