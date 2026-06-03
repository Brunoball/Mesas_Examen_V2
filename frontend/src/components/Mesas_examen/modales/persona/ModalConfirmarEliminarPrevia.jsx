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

const PROPIEDADES_SCROLL_FONDO = ["overflow", "overflow-x", "overflow-y", "overscroll-behavior"];

const bloquearScrollFondoConfirmacion = () => {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};

  const bloqueados = new Map();
  const elementos = new Set([
    document.documentElement,
    document.body,
    ...document.body.querySelectorAll("*"),
  ]);

  elementos.forEach((elemento) => {
    if (!(elemento instanceof HTMLElement) || elemento.closest(".persona-confirm-overlay")) return;

    const estilos = window.getComputedStyle(elemento);
    const puedeScrollear =
      elemento === document.documentElement ||
      elemento === document.body ||
      /(auto|scroll|overlay)/.test(`${estilos.overflow} ${estilos.overflowX} ${estilos.overflowY}`);

    if (!puedeScrollear) return;

    const originales = {};
    PROPIEDADES_SCROLL_FONDO.forEach((propiedad) => {
      originales[propiedad] = {
        valor: elemento.style.getPropertyValue(propiedad),
        prioridad: elemento.style.getPropertyPriority(propiedad),
      };
    });
    bloqueados.set(elemento, originales);

    elemento.style.setProperty("overflow", "hidden", "important");
    elemento.style.setProperty("overflow-x", "hidden", "important");
    elemento.style.setProperty("overflow-y", "hidden", "important");
    elemento.style.setProperty("overscroll-behavior", "none", "important");
  });

  return () => {
    bloqueados.forEach((originales, elemento) => {
      if (!(elemento instanceof HTMLElement)) return;
      PROPIEDADES_SCROLL_FONDO.forEach((propiedad) => {
        const original = originales[propiedad];
        if (original.valor) {
          elemento.style.setProperty(propiedad, original.valor, original.prioridad);
        } else {
          elemento.style.removeProperty(propiedad);
        }
      });
    });
  };
};

const ModalConfirmarEliminarPrevia = ({ abierto, previa, eliminando, onCancel, onConfirm }) => {
  const overlayRef = useEscapeClose(abierto, onCancel, eliminando);

  useEffect(() => {
    if (!abierto) return undefined;
    return bloquearScrollFondoConfirmacion();
  }, [abierto]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  return createPortal((
    <div ref={overlayRef} className="persona-modal-overlay persona-modal-overlay-top persona-confirm-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
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
