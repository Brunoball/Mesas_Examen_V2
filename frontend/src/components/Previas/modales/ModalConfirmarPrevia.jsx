import React from 'react';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export default function ModalConfirmarPrevia({ tipo, item, onConfirmar, onCerrar }) {
  const config = {
    baja: {
      operacion: 'baja',
      title: 'Dar de baja previa',
      message: 'La previa pasará a la sección de dados de baja. Podrás darla de alta nuevamente cuando lo necesites.',
      warning: '',
      confirmLabel: 'Dar de baja',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de baja correctamente.',
      errorMessage: 'No se pudo dar de baja la previa.',
      tone: 'warning',
      showReason: true,
      reasonLabel: 'Motivo de baja',
      reasonPlaceholder: 'Ej: registro cargado por error, alumno regularizó, etc.',
    },
    alta: {
      operacion: 'alta',
      title: 'Dar de alta previa',
      message: 'La previa volverá a figurar en el listado principal de previas activas.',
      warning: '',
      confirmLabel: 'Dar de alta',
      loadingLabel: 'Procesando...',
      successMessage: 'Previa dada de alta correctamente.',
      errorMessage: 'No se pudo dar de alta la previa.',
      tone: 'success',
      showReason: false,
    },
    eliminar: {
      operacion: 'eliminar',
      title: 'Eliminar previa',
      message: 'Esta acción eliminará el registro de forma permanente.',
      warning: 'Si la previa está vinculada a una mesa, el backend puede bloquear la eliminación.',
      confirmLabel: 'Eliminar',
      loadingLabel: 'Eliminando...',
      successMessage: 'Previa eliminada correctamente.',
      errorMessage: 'No se pudo eliminar la previa.',
      tone: 'danger',
      showReason: false,
    },
  }[tipo] || {
    operacion: 'advertencia',
    title: 'Confirmar operación',
    message: 'Confirmá la operación seleccionada.',
    warning: '',
    confirmLabel: 'Confirmar',
    loadingLabel: 'Procesando...',
    successMessage: 'Operación realizada correctamente.',
    errorMessage: 'No se pudo completar la operación.',
    tone: 'primary',
    showReason: false,
  };

  const details = [
    { label: 'Alumno', value: safeText(item?.alumno) },
    { label: 'DNI', value: safeText(item?.dni) },
    { label: 'Materia', value: safeText(item?.materia) },
    { label: 'Curso', value: safeText(item?.curso_materia) },
  ];

  return (
    <ModalEliminarGlobal
      open
      row={item}
      details={details}
      onClose={onCerrar}
      onConfirm={({ motivo }) => onConfirmar(motivo)}
      {...config}
    />
  );
}
