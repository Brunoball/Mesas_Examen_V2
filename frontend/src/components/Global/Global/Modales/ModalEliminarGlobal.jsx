import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamationTriangle,
  faTimes,
  faTrash,
  faUserCheck,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import '../Global_css/Global_ModalEliminar.css';

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function normalizarDetails(details = []) {
  if (!Array.isArray(details)) return [];

  return details
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      key: `${index}-${item.label ?? 'detalle'}`,
      label: safeText(item.label),
      value: safeText(item.value),
    }));
}

const OPERACION_CONFIG = {
  eliminar: {
    icon: faTrash,
    tone: 'danger',
    title: 'Eliminar registro',
    message: '¿Seguro que querés eliminar este registro definitivamente?',
    warning: 'Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    loadingLabel: 'Eliminando...',
    loadingMessage: 'Eliminando registro…',
    successMessage: 'Registro eliminado correctamente.',
    errorMessage: 'No se pudo eliminar el registro.',
  },
  baja: {
    icon: faUserSlash,
    tone: 'warning',
    title: 'Dar de baja registro',
    message: 'El registro dejará de figurar como activo, pero se conservará en dados de baja.',
    warning: '',
    confirmLabel: 'Dar de baja',
    loadingLabel: 'Procesando...',
    loadingMessage: 'Dando de baja…',
    successMessage: 'Registro dado de baja correctamente.',
    errorMessage: 'No se pudo dar de baja el registro.',
  },
  alta: {
    icon: faUserCheck,
    tone: 'success',
    title: 'Dar de alta registro',
    message: 'El registro volverá a figurar como activo.',
    warning: '',
    confirmLabel: 'Dar de alta',
    loadingLabel: 'Procesando...',
    loadingMessage: 'Dando de alta…',
    successMessage: 'Registro dado de alta correctamente.',
    errorMessage: 'No se pudo dar de alta el registro.',
  },
  advertencia: {
    icon: faExclamationTriangle,
    tone: 'warning',
    title: 'Confirmar acción',
    message: '¿Seguro que querés continuar?',
    warning: '',
    confirmLabel: 'Confirmar',
    loadingLabel: 'Procesando...',
    loadingMessage: 'Procesando…',
    successMessage: 'Operación realizada correctamente.',
    errorMessage: 'No se pudo completar la operación.',
  },
};

export default function ModalEliminarGlobal({
  open,
  operacion = 'eliminar',
  row = null,
  loading = false,
  onClose,
  onConfirm,
  onBeforeConfirm,
  onToast,

  title,
  message,
  warning,
  confirmLabel,
  cancelLabel = 'Cancelar',
  loadingLabel,
  loadingMessage,
  successMessage,
  errorMessage,
  tone,
  icon,

  details = null,
  extraContent = null,
  hideDefaultCard = false,

  showReason = false,
  reasonLabel = 'Motivo u observación',
  reasonPlaceholder = 'Escribí una observación opcional...',
  reasonRequired = false,
  initialReason = '',

  closeOnSuccess = true,
  confirmDisabled = false,
  hideLocalError = false,
}) {
  const cancelRef = useRef(null);
  const [procesandoInterno, setProcesandoInterno] = useState(false);
  const [reason, setReason] = useState(initialReason);
  const [localError, setLocalError] = useState('');

  const config = OPERACION_CONFIG[operacion] || OPERACION_CONFIG.advertencia;
  const isLoading = loading || procesandoInterno;
  const resolvedTone = tone || config.tone;
  const resolvedIcon = icon || config.icon;

  const resolvedTitle = title || config.title;
  const resolvedMessage = message || config.message;
  const resolvedWarning = warning ?? config.warning;
  const resolvedConfirmLabel = confirmLabel || config.confirmLabel;
  const resolvedLoadingLabel = loadingLabel || config.loadingLabel;
  const resolvedLoadingMessage = loadingMessage || config.loadingMessage;
  const resolvedSuccessMessage = successMessage || config.successMessage;
  const resolvedErrorMessage = errorMessage || config.errorMessage;

  useEffect(() => {
    if (!open) return;
    setReason(initialReason || '');
    setLocalError('');
  }, [open, initialReason]);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => {
      if (typeof onToast === 'function') onToast(tipo, mensaje, duracion);
    },
    [onToast]
  );

  const cerrar = useCallback(() => {
    if (isLoading) return;
    onClose?.();
  }, [isLoading, onClose]);

  const resolvedDetails = useMemo(() => {
    const customDetails = normalizarDetails(details);
    if (customDetails.length > 0) return customDetails;

    return normalizarDetails([
      { label: 'ID', value: row?.id ?? row?.id_docente ?? row?.idMovimiento ?? row?.id_movimiento },
      { label: 'Nombre', value: row?.nombre ?? row?.docente ?? row?.descripcion ?? row?.concepto },
      { label: 'Estado', value: row?.estado ?? row?.cargo ?? row?.tipo ?? row?.tipo_movimiento },
    ]);
  }, [details, row]);

  const handleConfirm = useCallback(async () => {
    if (isLoading || confirmDisabled || typeof onConfirm !== 'function') return;

    const cleanReason = reason.trim();
    if (showReason && reasonRequired && !cleanReason) {
      setLocalError('Tenés que completar el motivo para continuar.');
      return;
    }

    if (typeof onBeforeConfirm === 'function') {
      const continuar = onBeforeConfirm({ motivo: cleanReason, reason: cleanReason, row, operacion });
      if (continuar === false) {
        return;
      }
    }

    setLocalError('');
    setProcesandoInterno(true);
    showToast('cargando', resolvedLoadingMessage, 12000);

    let cerrarAlFinal = false;

    try {
      const result = await onConfirm({ motivo: cleanReason, reason: cleanReason, row, operacion });

      if (result && result.ok === false) {
        throw new Error(result.mensaje || result.message || resolvedErrorMessage);
      }

      showToast('exito', resolvedSuccessMessage, 2800);
      cerrarAlFinal = closeOnSuccess;
    } catch (error) {
      const mensaje = error?.message || resolvedErrorMessage;
      setLocalError(mensaje);
      showToast('error', mensaje, 4200);
    } finally {
      setProcesandoInterno(false);

      if (cerrarAlFinal) {
        onClose?.();
      }
    }
  }, [
    isLoading,
    confirmDisabled,
    onConfirm,
    onBeforeConfirm,
    reason,
    showReason,
    reasonRequired,
    showToast,
    resolvedLoadingMessage,
    resolvedSuccessMessage,
    closeOnSuccess,
    onClose,
    resolvedErrorMessage,
    row,
    operacion,
  ]);

  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => {
      cancelRef.current?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        cerrar();
        return;
      }

      const targetTag = String(event.target?.tagName || '').toLowerCase();
      const isTextArea = targetTag === 'textarea';

      if (event.key === 'Enter' && !isTextArea && !isLoading && !confirmDisabled) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        handleConfirm();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, cerrar, isLoading, confirmDisabled, handleConfirm]);

  if (!open) return null;

  return createPortal(
    <div
      className="gdel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdel-title"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={`gdel-modal gdel-modal--${resolvedTone}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="gdel-close"
          onClick={cerrar}
          aria-label="Cerrar"
          disabled={isLoading}
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <div className={`gdel-icon gdel-icon--${resolvedTone}`} aria-hidden="true">
          <FontAwesomeIcon icon={resolvedIcon} />
        </div>

        <h3 id="gdel-title" className={`gdel-title gdel-title--${resolvedTone}`}>
          {resolvedTitle}
        </h3>

        <p className="gdel-body">
          {resolvedMessage}
          {resolvedWarning ? (
            <>
              <br />
              <span>{resolvedWarning}</span>
            </>
          ) : null}
        </p>

        {localError && !hideLocalError && <div className="gdel-alert gdel-alert--error">{localError}</div>}

        {!hideDefaultCard && resolvedDetails.length > 0 && (
          <div className="gdel-card">
            {resolvedDetails.map((item) => (
              <div className="gdel-row" key={item.key}>
                <span className="gdel-label">{item.label}</span>
                <span className="gdel-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {showReason && (
          <label className={`gdel-reason ${reason.trim() ? 'is-active' : ''}`}>
            <span className="gdel-reason__label">{reasonLabel}</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              disabled={isLoading}
            />
          </label>
        )}

        {extraContent ? <div className="gdel-extraContent">{extraContent}</div> : null}

        <div className="gdel-actions">
          <button
            ref={cancelRef}
            type="button"
            className="gdel-btn gdel-btn--ghost"
            onClick={cerrar}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={`gdel-btn gdel-btn--solid-${resolvedTone}`}
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
          >
            {isLoading ? resolvedLoadingLabel : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
