import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel, faFilePdf, faTimes } from "@fortawesome/free-solid-svg-icons";
import "../Global_css/Global_Modals.css";
import "../Global_css/Global_ExportarHistorial.css";

const ICONOS_FORMATO = {
  excel: faFileExcel,
  pdf: faFilePdf,
};

const OPCIONES_DEFAULT = [
  {
    value: "excel",
    label: "Excel",
    description: "Libro con 2 hojas.",
    icon: "excel",
    tone: "excel",
  },
  {
    value: "pdf",
    label: "PDF",
    description: "PDF con 2 secciones continuas.",
    icon: "pdf",
    tone: "pdf",
  },
];

const pluralizar = (cantidad, singular, plural) => (
  Number(cantidad) === 1 ? singular : plural
);

const ModalExportarHistorialGlobal = ({
  abierto,
  open,
  loading = false,
  cantidadArmados,
  cantidad,
  total,
  totalLabelSingular = "armado disponible",
  totalLabelPlural = "armados disponibles",
  busqueda = "",
  title = "Exportar historial",
  subtitle = "Elegí si querés descargar el historial en Excel o PDF.",
  scopeText,
  emptyScopeText = "Se exporta todo el historial de armados guardados.",
  filteredScopePrefix = "Se exporta el historial filtrado por",
  note = "La exportación genera 2 hojas/secciones: historial de notas y previas, y detalle completo de mesas en una sola tabla.",
  options = OPCIONES_DEFAULT,
  defaultFormato = "excel",
  confirmLabel = "Exportar",
  cancelLabel = "Cancelar",
  loadingLabel = "Exportando...",
  disabled = false,
  onClose,
  onConfirm,
}) => {
  const isOpen = Boolean(open ?? abierto);
  const totalDisponible = Number(total ?? cantidad ?? cantidadArmados ?? 0);
  const [formato, setFormato] = useState(defaultFormato || options?.[0]?.value || "excel");

  useEffect(() => {
    if (!isOpen) return;
    setFormato(defaultFormato || options?.[0]?.value || "excel");
  }, [defaultFormato, isOpen, options]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!loading) onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, loading, onClose]);

  const busquedaLimpia = String(busqueda || "").trim();
  const textoAlcance = useMemo(() => {
    if (scopeText) return scopeText;
    if (busquedaLimpia) return `${filteredScopePrefix}: “${busquedaLimpia}”.`;
    return emptyScopeText;
  }, [busquedaLimpia, emptyScopeText, filteredScopePrefix, scopeText]);

  if (!isOpen) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const opcionesVisibles = Array.isArray(options) && options.length > 0 ? options : OPCIONES_DEFAULT;
  const opcionActiva = opcionesVisibles.find((opcion) => opcion.value === formato) || opcionesVisibles[0];
  const iconoConfirmar = ICONOS_FORMATO[opcionActiva?.icon] || ICONOS_FORMATO[formato] || faFileExcel;
  const submitDisabled = loading || disabled || totalDisponible <= 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitDisabled) return;
    onConfirm?.({ formato, option: opcionActiva });
  };

  return createPortal((
    <div className="global-exportHistorial-overlay" role="dialog" aria-modal="true" aria-labelledby="global-exportHistorial-title">
      <form className="global-exportHistorial-modal" onSubmit={handleSubmit}>
        <header className="global-exportHistorial-header">
          <div>
            <h2 id="global-exportHistorial-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <button
            type="button"
            className="global-exportHistorial-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="global-exportHistorial-body">
          <div className="global-exportHistorial-info">
            <strong>{totalDisponible}</strong>
            <span>{pluralizar(totalDisponible, totalLabelSingular, totalLabelPlural)}</span>
          </div>

          {textoAlcance ? <p className="global-exportHistorial-scope">{textoAlcance}</p> : null}
          {note ? <p className="global-exportHistorial-note">{note}</p> : null}

          <div className="global-exportHistorial-options" role="radiogroup" aria-label="Formato de exportación">
            {opcionesVisibles.map((opcion) => {
              const value = String(opcion.value || "");
              const isActive = formato === value;
              const tone = opcion.tone || opcion.icon || value;
              const icono = ICONOS_FORMATO[opcion.icon] || ICONOS_FORMATO[value] || faFileExcel;

              return (
                <label key={value} className={`global-exportHistorial-option ${isActive ? "is-active" : ""}`}>
                  <input
                    type="radio"
                    name="formato_historial_global"
                    value={value}
                    checked={isActive}
                    disabled={loading}
                    onChange={() => setFormato(value)}
                  />
                  <span className={`global-exportHistorial-icon is-${tone}`}>
                    <FontAwesomeIcon icon={icono} />
                  </span>
                  <span>
                    <b>{opcion.label}</b>
                    {opcion.description ? <small>{opcion.description}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <footer className="global-exportHistorial-footer">
          <button
            type="button"
            className="global-exportHistorial-action global-exportHistorial-action--secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>

          <button
            type="submit"
            className="global-exportHistorial-action global-exportHistorial-action--primary"
            disabled={submitDisabled}
          >
            <FontAwesomeIcon icon={iconoConfirmar} />
            {loading ? loadingLabel : confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  ), portalTarget);
};

export default ModalExportarHistorialGlobal;
