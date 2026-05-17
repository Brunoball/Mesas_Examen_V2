// src/components/Mesas_examen/modales/persona/ModalConfirmarEliminarPrevia.jsx
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";

import "./persona.css";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const ModalConfirmarEliminarPrevia = ({ abierto, previa, eliminando, onCancel, onConfirm }) => {
  if (!abierto) return null;

  return (
    <div className="persona-modal-overlay persona-modal-overlay-top" role="dialog" aria-modal="true">
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
  );
};

export default ModalConfirmarEliminarPrevia;
