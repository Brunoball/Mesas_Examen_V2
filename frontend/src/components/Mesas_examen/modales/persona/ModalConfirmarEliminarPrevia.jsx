// src/components/Mesas_examen/modales/persona/ModalConfirmarEliminarPrevia.jsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const isTopMesaModal = (node) => {
  if (typeof document === "undefined" || !node) return true;
  const modales = Array.from(document.querySelectorAll("[data-mesa-modal-root='true'], .gdel-overlay, [data-global-info-modal-root='true']"));
  return modales[modales.length - 1] === node;
};

const useEscapeClose = (abierto, onClose, disabled = false) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || disabled) return;
      if (!isTopMesaModal(overlayRef.current)) return;

      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [abierto, onClose, disabled]);

  return overlayRef;
};

const ModalConfirmarEliminarPrevia = ({ abierto, previa, eliminando, onCancel, onConfirm }) => {
  const overlayRef = useEscapeClose(abierto, onCancel, eliminando);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  return createPortal((
    <div ref={overlayRef} className="persona-modal-overlay persona-modal-overlay-top" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="persona-confirm-card">
        <div className="persona-confirm-icon">
          <FontAwesomeIcon icon={faTrash} />
        </div>
        <h3>Confirmar acción</h3>
        <p>
          ¿Eliminar a <strong>{texto(previa?.alumno)}</strong> de la mesa N° <strong>{texto(previa?.numero_mesa)}</strong>?
        </p>
        <div className="persona-confirm-detail">
          Mesa N° {texto(previa?.numero_mesa)} · DNI: {texto(previa?.dni)} · Curso: {texto(previa?.curso)}
        </div>
        <div className="persona-confirm-actions">
          <button type="button" className="persona-btn-secondary" onClick={onCancel} disabled={eliminando}>Cancelar</button>
          <button type="button" className="persona-btn-danger" onClick={onConfirm} disabled={eliminando}>
            <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  ), portalTarget);
};

export default ModalConfirmarEliminarPrevia;
