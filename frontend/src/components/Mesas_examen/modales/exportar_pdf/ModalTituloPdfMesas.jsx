import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faTimes } from "@fortawesome/free-solid-svg-icons";
import "../../../Global/Global_css/Global_Modals.css";
import "./ModalTituloPdfMesas.css";
import { construirTituloPdfExportacion } from "./mesasPdfExporter";

const ModalTituloPdfMesas = ({ abierto, loading = false, onClose, onConfirm }) => {
  const [tituloFijo, setTituloFijo] = useState("MESAS DE EXAMEN");
  const [continuacion, setContinuacion] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setTituloFijo("MESAS DE EXAMEN");
    setContinuacion("");
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

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const preview = construirTituloPdfExportacion({ tituloFijo, continuacion });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (loading) return;
    onConfirm?.({ tituloFijo, continuacion });
  };

  return createPortal((
    <div className="mesas-title-pdf-overlay" role="dialog" aria-modal="true" aria-labelledby="mesas-title-pdf-title">
      <form className="mesas-title-pdf-modal" onSubmit={handleSubmit}>
        <header className="mesas-title-pdf-header">
          <div>
            <h2 id="mesas-title-pdf-title">Título del PDF</h2>
            <p>Elegí cómo querés que salga el título en la parte superior del PDF.</p>
          </div>
          <button type="button" className="mesas-title-pdf-close" onClick={onClose} disabled={loading} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="mesas-title-pdf-body">
          <div className="mesas-title-pdf-config">
            <h3>Configuración</h3>
            <div className="mesas-title-pdf-grid">
              <label className="mesas-title-pdf-field">
                <span>Título fijo</span>
                <input
                  type="text"
                  value={tituloFijo}
                  onChange={(event) => setTituloFijo(event.target.value.toUpperCase())}
                  placeholder="MESAS DE EXAMEN"
                  disabled={loading}
                />
                <small>Este texto siempre se mantiene.</small>
              </label>

              <label className="mesas-title-pdf-field">
                <span>Continuación (opcional)</span>
                <input
                  type="text"
                  value={continuacion}
                  onChange={(event) => setContinuacion(event.target.value.toUpperCase())}
                  placeholder="Ej: FEBRERO 2026"
                  disabled={loading}
                  autoFocus
                />
                <small>Podés dejarlo vacío si no querés agregar nada.</small>
              </label>
            </div>
            <p className="mesas-title-pdf-preview"><strong>Vista previa:</strong> {preview}</p>
          </div>
        </section>

        <footer className="mesas-title-pdf-footer">
          <button type="button" className="mesas-title-pdf-btn mesas-title-pdf-btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="mesas-title-pdf-btn mesas-title-pdf-btn-primary" disabled={loading}>
            <FontAwesomeIcon icon={faFilePdf} />
            {loading ? "Exportando..." : "Confirmar y exportar"}
          </button>
        </footer>
      </form>
    </div>
  ), portalTarget);
};

export default ModalTituloPdfMesas;
