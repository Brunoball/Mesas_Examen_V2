import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faDownload,
  faEye,
  faFileExcel,
  faSpinner,
  faTimes,
  faTriangleExclamation,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import './ModalPrevias.css';

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
}) {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [dragActivo, setDragActivo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [preview, setPreview] = useState(null);

  if (!open) return null;

  async function seleccionarArchivo(file) {
    setResultado(null);
    setPreview(null);

    if (!file) return;

    if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
      setResultado({ ok: false, mensaje: 'Seleccioná un archivo Excel con extensión .xlsx.' });
      setArchivo(null);
      return;
    }

    setArchivo(file);
    setPrevisualizando(true);

    const res = await onPrevisualizar?.(file);
    setPrevisualizando(false);

    if (res?.ok) {
      setPreview(res.data || {});
      setResultado({ ok: true, mensaje: res.mensaje || 'Vista previa generada correctamente.', esPreview: true });
    } else {
      setResultado(res || { ok: false, mensaje: 'No se pudo previsualizar el Excel.' });
    }
  }

  async function descargarPlantilla() {
    setDescargando(true);
    const res = await onDescargarPlantilla?.();
    if (res && res.ok === false) {
      setResultado({ ok: false, mensaje: res.mensaje || 'No se pudo descargar la plantilla.' });
    }
    setDescargando(false);
  }

  async function confirmarImportacion() {
    if (!archivo || procesando || previsualizando || !preview?.valido) return;

    setProcesando(true);
    setResultado(null);
    const res = await onImportar?.(archivo);
    setResultado(res || { ok: false, mensaje: 'No se pudo importar el archivo.' });
    setProcesando(false);

    if (res?.ok) {
      setArchivo(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActivo(false);
    const file = e.dataTransfer?.files?.[0];
    seleccionarArchivo(file);
  }

  const previewRows = Array.isArray(preview?.filas) ? preview.filas : [];
  const previewStats = preview?.resumen || {};
  const errores = Array.isArray(resultado?.errores) ? resultado.errores : [];
  const puedeImportar = Boolean(archivo && preview?.valido && !procesando && !previsualizando);

  return (
    <div className="modal-previa-overlay modal-importar-previas-overlay" role="dialog" aria-modal="true">
      <div className="modal-previa modal-importar-previas">
        <div className="modal-previa-header modal-importar-previas__header">
          <div>
            <h2>Importación masiva de previas</h2>
            <p>Cargá un Excel .xlsx. Primero se genera una vista previa y recién después confirmás la importación.</p>
          </div>
          <button type="button" className="modal-previa-close" onClick={onClose} disabled={procesando || previsualizando}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-importar-previas__body">
          <section className="modal-importar-previas__panel modal-importar-previas__panel--info">
            <div className="modal-importar-previas__iconBox">
              <FontAwesomeIcon icon={faFileExcel} />
            </div>
            <h3>1. Descargá la plantilla</h3>
            <p>
              Usá exactamente esas cabeceras para evitar errores. La importación no pide nota ni fecha de nota; esos campos quedan en NULL.
            </p>
            <button type="button" className="mov-btn mov-btn--soft modal-importar-previas__download" onClick={descargarPlantilla} disabled={descargando || procesando || previsualizando}>
              <FontAwesomeIcon icon={descargando ? faSpinner : faDownload} spin={descargando} />
              Descargar Excel modelo
            </button>

            <div className="modal-importar-previas__rules">
              <strong>Comparación segura</strong>
              <span>Si coincide DNI + materia + curso/división de la materia + año, actualiza la previa existente.</span>
              <span>Si no existe, crea una nueva con inscripción 0 y activo 1.</span>
              <span>Si hay errores, no guarda nada hasta corregir el Excel.</span>
            </div>
          </section>

          <section className="modal-importar-previas__panel">
            <h3>2. Arrastrá o buscá el Excel</h3>

            <div
              className={`modal-importar-previas__drop ${dragActivo ? 'is-dragging' : ''} ${archivo ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
              onDragLeave={() => setDragActivo(false)}
              onDrop={handleDrop}
              onClick={() => !previsualizando && inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' && !previsualizando) inputRef.current?.click(); }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => seleccionarArchivo(e.target.files?.[0])}
              />
              <FontAwesomeIcon icon={previsualizando ? faSpinner : faUpload} spin={previsualizando} className="modal-importar-previas__dropIcon" />
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

            {resultado && (
              <div className={`modal-importar-previas__resultado ${resultado.ok ? 'is-ok' : 'is-error'}`}>
                <div className="modal-importar-previas__resultadoHead">
                  <FontAwesomeIcon icon={resultado.ok ? faCheckCircle : faTriangleExclamation} />
                  <strong>{resultado.mensaje || (resultado.ok ? 'Operación completada.' : 'No se pudo procesar.')}</strong>
                </div>

                {resultado.ok && resultado.data && !resultado.esPreview && (
                  <div className="modal-importar-previas__stats">
                    <span>Procesadas: <b>{resultado.data.total_procesadas ?? 0}</b></span>
                    <span>Nuevas: <b>{resultado.data.nuevas ?? 0}</b></span>
                    <span>Actualizadas: <b>{resultado.data.actualizadas ?? 0}</b></span>
                  </div>
                )}

                {!resultado.ok && errores.length > 0 && (
                  <div className="modal-importar-previas__errores">
                    {errores.map((err, index) => (
                      <span key={`${err}-${index}`}>{err}</span>
                    ))}
                    {Number(resultado.totalErrores || 0) > errores.length && (
                      <b>Hay {Number(resultado.totalErrores) - errores.length} errores más. Corregí los primeros y volvé a probar.</b>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {preview && (
          <section className="modal-importar-previas__preview">
            <div className="modal-importar-previas__previewHead">
              <div>
                <h3><FontAwesomeIcon icon={faEye} /> Vista previa antes de importar</h3>
                <p>
                  Se muestran las primeras {previewRows.length} filas válidas. Confirmá solo si la conversión de datos es correcta.
                </p>
              </div>
              <div className="modal-importar-previas__stats modal-importar-previas__stats--preview">
                <span>Total: <b>{previewStats.total_procesadas ?? 0}</b></span>
                <span>Nuevas: <b>{previewStats.nuevas ?? 0}</b></span>
                <span>Actualizadas: <b>{previewStats.actualizadas ?? 0}</b></span>
              </div>
            </div>

            <div className="modal-importar-previas__previewTableWrap">
              <table className="modal-importar-previas__previewTable">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Fila</th>
                    <th>Alumno</th>
                    <th>DNI</th>
                    <th>Materia</th>
                    <th>Curso materia</th>
                    <th>Actual</th>
                    <th>Condición</th>
                    <th>Año</th>
                    <th>Fecha carga</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={`${row.fila}-${row.dni}-${row.id_materia}`}>
                      <td><span className={`modal-importar-previas__accion ${badgeAccion(row.accion)}`}>{safeText(row.accion)}</span></td>
                      <td>{safeText(row.fila)}</td>
                      <td>{safeText(row.alumno)}</td>
                      <td>{safeText(row.dni)}</td>
                      <td>{safeText(row.materia)}</td>
                      <td>{safeText(row.curso_materia)}</td>
                      <td>{safeText(row.curso_actual)}</td>
                      <td>{safeText(row.condicion)}</td>
                      <td>{safeText(row.anio)}</td>
                      <td>{safeText(row.fecha_carga)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {Number(previewStats.total_procesadas || 0) > previewRows.length && (
              <p className="modal-importar-previas__previewNote">
                Hay {Number(previewStats.total_procesadas) - previewRows.length} filas más que también se validaron correctamente.
              </p>
            )}
          </section>
        )}

        <div className="modal-previa-footer modal-importar-previas__footer">
          <button type="button" className="mov-btn mov-btn--ghost" onClick={onClose} disabled={procesando || previsualizando}>
            Cancelar
          </button>
          <button type="button" className="mov-btn mov-btn--primary" onClick={confirmarImportacion} disabled={!puedeImportar}>
            <FontAwesomeIcon icon={procesando ? faSpinner : faUpload} spin={procesando} />
            {procesando ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
