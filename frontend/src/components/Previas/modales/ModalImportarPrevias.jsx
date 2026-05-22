import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload,
  faEye,
  faFileExcel,
  faSpinner,
  faTimes,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import './ModalImportarPrevias.css';

const PREVIEW_GRID_COLS = '112px 72px minmax(170px, 1.25fr) 106px minmax(170px, 1.2fr) 132px 112px 120px 78px 126px';

const PREVIEW_COLUMNS = [
  { key: 'accion', label: 'Acción', className: 'is-action' },
  { key: 'fila', label: 'Fila', className: 'is-center' },
  { key: 'alumno', label: 'Alumno' },
  { key: 'dni', label: 'DNI' },
  { key: 'materia', label: 'Materia' },
  { key: 'curso_materia', label: 'Curso materia' },
  { key: 'curso_actual', label: 'Actual' },
  { key: 'condicion', label: 'Condición' },
  { key: 'anio', label: 'Año', className: 'is-center' },
  { key: 'fecha_carga', label: 'Fecha carga' },
];

function formatoPeso(bytes = 0) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function mensajeToastResultado(res, fallback) {
  const mensaje = String(res?.mensaje || fallback || '').trim();
  const errores = Array.isArray(res?.errores) ? res.errores.filter(Boolean) : [];
  const primerosErrores = errores.slice(0, 3).map((err) => String(err).trim()).filter(Boolean);
  const totalErrores = Number(res?.totalErrores || res?.total_errores || errores.length || 0);

  if (primerosErrores.length === 0) return mensaje || fallback || 'No se pudo procesar la operación.';

  const extras = primerosErrores.join(' • ');
  const restantes = totalErrores > primerosErrores.length
    ? ` • ${totalErrores - primerosErrores.length} errores más.`
    : '';

  return `${mensaje || fallback || 'Revisá el archivo.'} ${extras}${restantes}`.trim();
}

function badgeAccion(accion) {
  const value = String(accion || '').toLowerCase();
  if (value.includes('actual')) return 'is-update';
  if (value.includes('nueva') || value.includes('crear')) return 'is-new';
  return '';
}

export default function ModalImportarPrevias({
  open,
  onClose,
  onDescargarPlantilla,
  onPrevisualizar,
  onImportar,
  onToast,
}) {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [dragActivo, setDragActivo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [preview, setPreview] = useState(null);

  function mostrarToast(tipo, texto, duracion = 4200) {
    if (!texto || typeof onToast !== 'function') return;
    onToast(tipo, texto, duracion);
  }

  useEffect(() => {
    if (!open) return undefined;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!procesando && !previsualizando) onClose?.();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, procesando, previsualizando, onClose]);

  if (!open) return null;

  async function seleccionarArchivo(file) {
    setResultado(null);
    setPreview(null);

    if (!file) return;

    if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
      setResultado(null);
      mostrarToast('advertencia', 'Seleccioná un archivo Excel con extensión .xlsx.', 5200);
      setArchivo(null);
      return;
    }

    setArchivo(file);
    setPrevisualizando(true);

    const res = await onPrevisualizar?.(file);
    setPrevisualizando(false);

    if (res?.ok) {
      setPreview(res.data || {});
      setResultado(null);
      mostrarToast('exito', res.mensaje || 'Vista previa generada correctamente.', 3200);
    } else {
      setResultado(null);
      mostrarToast('error', mensajeToastResultado(res, 'No se pudo previsualizar el Excel.'), 5200);
    }
  }

  async function descargarPlantilla() {
    setDescargando(true);
    const res = await onDescargarPlantilla?.();
    if (res && res.ok === false) {
      setResultado(null);
    }
    setDescargando(false);
  }

  async function confirmarImportacion() {
    if (!archivo || procesando || previsualizando || !preview?.valido) return;

    setProcesando(true);
    setResultado(null);
    const res = await onImportar?.(archivo);
    setProcesando(false);

    if (res?.ok) {
      setResultado({ ok: true, data: res.data || {} });
      setArchivo(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setResultado(null);
    mostrarToast('error', mensajeToastResultado(res, 'No se pudo importar el archivo.'), 5200);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragActivo(false);
    const file = event.dataTransfer?.files?.[0];
    seleccionarArchivo(file);
  }

  const previewRows = Array.isArray(preview?.filas) ? preview.filas : [];
  const previewStats = preview?.resumen || {};
  const puedeImportar = Boolean(archivo && preview?.valido && !procesando && !previsualizando);

  const modal = (
    <div
      className="gm-modalOverlay modal-importar-previas-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="gm-modal gm-modal--docente gm-modal--importar-previas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-importar-previas-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="gm-modal__header">
          <div className="gm-modal__headIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faFileExcel} />
          </div>

          <div className="gm-modal__headText">
            <h2 id="modal-importar-previas-title">Importación masiva de previas</h2>
            <p>Cargá un Excel .xlsx, revisá la vista previa y confirmá recién cuando los datos estén correctos.</p>
          </div>

          <button
            type="button"
            className="gm-modal__close"
            onClick={onClose}
            disabled={procesando || previsualizando}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <div className="gm-modal__content modal-importar-previas__content">
          <div className="modal-importar-previas__body">
            <section className="gm-panel modal-importar-previas__panel modal-importar-previas__panel--info">
              <div className="gm-panel__head">
                <div>
                  <span className="gm-panel__eyebrow">Paso 1</span>
                  <h3><FontAwesomeIcon icon={faDownload} /> Descargar plantilla</h3>
                </div>
                <span className="gm-panel__tag">Excel modelo</span>
              </div>

              <div className="gm-panel__body">
                <p className="modal-importar-previas__text">
                  Usá exactamente las cabeceras del archivo modelo para evitar errores durante la validación.
                </p>

                <button
                  type="button"
                  className="gm-btn gm-btn--soft modal-importar-previas__download"
                  onClick={descargarPlantilla}
                  disabled={descargando || procesando || previsualizando}
                >
                  <FontAwesomeIcon icon={descargando ? faSpinner : faDownload} spin={descargando} />
                  Descargar Excel modelo
                </button>

                <div className="modal-importar-previas__rules" aria-label="Reglas de importación">
                  <strong>Comparación segura</strong>
                  <span>Si coincide DNI + materia + curso/división de la materia + año, actualiza la previa existente.</span>
                  <span>Si no existe coincidencia, crea una nueva previa.</span>
                  <span>Si hay errores, no guarda nada hasta corregir el Excel.</span>
                </div>
              </div>
            </section>

            <section className="gm-panel modal-importar-previas__panel">
              <div className="gm-panel__head">
                <div>
                  <span className="gm-panel__eyebrow">Paso 2</span>
                  <h3><FontAwesomeIcon icon={faUpload} /> Cargar archivo</h3>
                </div>
                <span className="gm-panel__tag">.xlsx</span>
              </div>

              <div className="gm-panel__body">
                <div
                  className={`modal-importar-previas__drop ${dragActivo ? 'is-dragging' : ''} ${archivo ? 'has-file' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDragActivo(true); }}
                  onDragLeave={() => setDragActivo(false)}
                  onDrop={handleDrop}
                  onClick={() => !previsualizando && inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !previsualizando) {
                      event.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    hidden
                    onChange={(event) => seleccionarArchivo(event.target.files?.[0])}
                  />
                  <span className="modal-importar-previas__dropIcon" aria-hidden="true">
                    <FontAwesomeIcon icon={previsualizando ? faSpinner : faUpload} spin={previsualizando} />
                  </span>
                  {archivo ? (
                    <div className="modal-importar-previas__fileInfo">
                      <strong>{archivo.name}</strong>
                      <span>{previsualizando ? 'Generando vista previa...' : formatoPeso(archivo.size)}</span>
                    </div>
                  ) : (
                    <div className="modal-importar-previas__fileInfo">
                      <strong>Soltá el archivo acá</strong>
                      <span>o hacé clic para buscarlo en tu computadora</span>
                    </div>
                  )}
                </div>

                {resultado?.ok && resultado.data && (
                  <div className="modal-importar-previas__resultado is-ok" aria-label="Indicadores de importación">
                    <div className="modal-importar-previas__stats">
                      <span>Procesadas: <b>{resultado.data.total_procesadas ?? 0}</b></span>
                      <span>Nuevas: <b>{resultado.data.nuevas ?? 0}</b></span>
                      <span>Actualizadas: <b>{resultado.data.actualizadas ?? 0}</b></span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {preview && (
            <section className="gm-panel modal-importar-previas__preview">
              <div className="gm-panel__head gm-panel__head--split modal-importar-previas__previewHead">
                <div>
                  <span className="gm-panel__eyebrow">Validación</span>
                  <h3><FontAwesomeIcon icon={faEye} /> Vista previa antes de importar</h3>
                  <p>Se muestran las primeras {previewRows.length} filas válidas. Confirmá solo si la conversión de datos es correcta.</p>
                </div>

                <div className="modal-importar-previas__stats modal-importar-previas__stats--preview" aria-label="Resumen de vista previa">
                  <span>Total: <b>{previewStats.total_procesadas ?? 0}</b></span>
                  <span>Nuevas: <b>{previewStats.nuevas ?? 0}</b></span>
                  <span>Actualizadas: <b>{previewStats.actualizadas ?? 0}</b></span>
                </div>
              </div>

              <div className="modal-importar-previas__previewGrid" role="table" style={{ '--preview-grid-cols': PREVIEW_GRID_COLS }}>
                <div className="modal-importar-previas__previewGridHead" role="row">
                  {PREVIEW_COLUMNS.map((column) => (
                    <div key={column.key} className={`modal-importar-previas__previewCell ${column.className || ''}`} role="columnheader">
                      {column.label}
                    </div>
                  ))}
                </div>

                <div className="modal-importar-previas__previewGridBody" role="rowgroup">
                  {previewRows.map((row) => (
                    <div className="modal-importar-previas__previewGridRow" role="row" key={`${row.fila}-${row.dni}-${row.id_materia}`}>
                      {PREVIEW_COLUMNS.map((column) => (
                        <div
                          key={column.key}
                          className={`modal-importar-previas__previewCell ${column.className || ''}`}
                          role="cell"
                          data-label={column.label}
                        >
                          {column.key === 'accion' ? (
                            <span className={`modal-importar-previas__accion ${badgeAccion(row.accion)}`}>{safeText(row.accion)}</span>
                          ) : (
                            safeText(row[column.key])
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {Number(previewStats.total_procesadas || 0) > previewRows.length && (
                <p className="modal-importar-previas__previewNote">
                  Hay {Number(previewStats.total_procesadas) - previewRows.length} filas más que también se validaron correctamente.
                </p>
              )}
            </section>
          )}
        </div>

        <div className="gm-modal__actions modal-importar-previas__actions">
          <button type="button" className="gm-btn gm-btn--ghost" onClick={onClose} disabled={procesando || previsualizando}>
            <FontAwesomeIcon icon={faTimes} />
            Cancelar
          </button>
          <button type="button" className="gm-btn gm-btn--primary" onClick={confirmarImportacion} disabled={!puedeImportar}>
            <FontAwesomeIcon icon={procesando ? faSpinner : faUpload} spin={procesando} />
            {procesando ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
