import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel, faFilePdf, faTimes } from "@fortawesome/free-solid-svg-icons";
import "../../../Global/Global_css/Global_Modals.css";
import "./ModalExportarHistorial.css";

const ModalExportarHistorial = ({
  abierto,
  loading = false,
  cantidadArmados = 0,
  busqueda = "",
  onClose,
  onConfirm,
}) => {
  const [formato, setFormato] = useState("excel");

  useEffect(() => {
    if (!abierto) return;
    setFormato("excel");
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!loading) onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [abierto, loading, onClose]);

  const busquedaLimpia = String(busqueda || "").trim();
  const textoAlcance = useMemo(() => {
    if (busquedaLimpia) {
      return `Se exporta el historial filtrado por: “${busquedaLimpia}”.`;
    }
    return "Se exporta todo el historial de armados guardados.";
  }, [busquedaLimpia]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (loading) return;
    onConfirm?.({ formato });
  };

  return createPortal((
    <div className="mesas-export-historial-overlay" role="dialog" aria-modal="true" aria-labelledby="mesas-export-historial-title">
      <form className="mesas-export-historial-modal" onSubmit={handleSubmit}>
        <header className="mesas-export-historial-header">
          <div>
            <h2 id="mesas-export-historial-title">Exportar historial</h2>
            <p>Elegí si querés descargar el historial en Excel o PDF.</p>
          </div>
          <button type="button" className="mesas-export-historial-close" onClick={onClose} disabled={loading} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="mesas-export-historial-body">
          <div className="mesas-export-historial-info">
            <strong>{cantidadArmados}</strong>
            <span>{cantidadArmados === 1 ? "armado disponible" : "armados disponibles"}</span>
          </div>

          <p className="mesas-export-historial-scope">{textoAlcance}</p>
          <p className="mesas-export-historial-note">La exportación genera <b>2 hojas/secciones</b>: historial de notas y previas, y detalle completo de mesas en una sola tabla.</p>

          <div className="mesas-export-historial-options" role="radiogroup" aria-label="Formato de exportación">
            <label className={`mesas-export-historial-option ${formato === "excel" ? "is-active" : ""}`}>
              <input
                type="radio"
                name="formato_historial"
                value="excel"
                checked={formato === "excel"}
                disabled={loading}
                onChange={() => setFormato("excel")}
              />
              <span className="mesas-export-historial-icon is-excel"><FontAwesomeIcon icon={faFileExcel} /></span>
              <span>
                <b>Excel</b>
                <small>Libro con 2 hojas.</small>
              </span>
            </label>

            <label className={`mesas-export-historial-option ${formato === "pdf" ? "is-active" : ""}`}>
              <input
                type="radio"
                name="formato_historial"
                value="pdf"
                checked={formato === "pdf"}
                disabled={loading}
                onChange={() => setFormato("pdf")}
              />
              <span className="mesas-export-historial-icon is-pdf"><FontAwesomeIcon icon={faFilePdf} /></span>
              <span>
                <b>PDF</b>
                <small>PDF con 2 secciones continuas.</small>
              </span>
            </label>
          </div>
        </section>

        <footer className="mesas-export-historial-footer">
          <button type="button" className="mesas-export-historial-btn mesas-export-historial-btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="mesas-export-historial-btn mesas-export-historial-btn-primary" disabled={loading || cantidadArmados <= 0}>
            <FontAwesomeIcon icon={formato === "excel" ? faFileExcel : faFilePdf} />
            {loading ? "Exportando..." : "Exportar"}
          </button>
        </footer>
      </form>
    </div>
  ), portalTarget);
};

export default ModalExportarHistorial;
