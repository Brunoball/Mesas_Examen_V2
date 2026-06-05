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
import Toast from '../Toast';
import '../Global_css/Global_ModalEliminar.css';

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function normalizarMayus(value) {
  return String(value ?? '').toLocaleUpperCase('es-AR');
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

const SCROLL_LOCK_PROPERTIES = ['overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior'];
let scrollLockCount = 0;
const elementosScrollBloqueados = new Map();

function bloquearScrollDeFondo() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  scrollLockCount += 1;

  if (scrollLockCount === 1) {
    const elementos = new Set([
      document.documentElement,
      document.body,
      ...document.body.querySelectorAll('*'),
    ]);

    elementos.forEach((elemento) => {
      if (!(elemento instanceof HTMLElement) || elemento.closest('.gdel-overlay')) return;

      const estilos = window.getComputedStyle(elemento);
      const puedeScrollear =
        elemento === document.documentElement ||
        elemento === document.body ||
        /(auto|scroll|overlay)/.test(
          `${estilos.overflow} ${estilos.overflowX} ${estilos.overflowY}`
        );

      if (!puedeScrollear) return;

      const originales = {};
      SCROLL_LOCK_PROPERTIES.forEach((propiedad) => {
        originales[propiedad] = {
          valor: elemento.style.getPropertyValue(propiedad),
          prioridad: elemento.style.getPropertyPriority(propiedad),
        };
      });
      elementosScrollBloqueados.set(elemento, originales);

      elemento.style.setProperty('overflow', 'hidden', 'important');
      elemento.style.setProperty('overflow-x', 'hidden', 'important');
      elemento.style.setProperty('overflow-y', 'hidden', 'important');
      elemento.style.setProperty('overscroll-behavior', 'none', 'important');
    });
  }

  let desbloqueado = false;

  return () => {
    if (desbloqueado) return;
    desbloqueado = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);

    if (scrollLockCount !== 0) return;

    elementosScrollBloqueados.forEach((originales, elemento) => {
      if (!(elemento instanceof HTMLElement)) return;

      SCROLL_LOCK_PROPERTIES.forEach((propiedad) => {
        const original = originales[propiedad];
        if (original.valor) {
          elemento.style.setProperty(propiedad, original.valor, original.prioridad);
        } else {
          elemento.style.removeProperty(propiedad);
        }
      });
    });

    elementosScrollBloqueados.clear();
  };
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
}) {
  const cancelRef = useRef(null);
  const reasonRef = useRef(null);
  const [procesandoInterno, setProcesandoInterno] = useState(false);
  const [reason, setReason] = useState(normalizarMayus(initialReason));
  const [toastLocal, setToastLocal] = useState(null);


  useEffect(() => {
    if (!open) return undefined;
    return bloquearScrollDeFondo();
  }, [open]);

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
    setReason(normalizarMayus(initialReason));
    setToastLocal(null);
  }, [open, initialReason]);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => {
      if (!mensaje) return;

      if (typeof onToast === 'function') {
        onToast(tipo, mensaje, duracion);
        return;
      }

      setToastLocal({
        id: Date.now(),
        tipo,
        mensaje,
        duracion,
      });
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
      showToast('error', 'Tenés que completar el motivo para continuar.', 4200);
      return;
    }

    if (typeof onBeforeConfirm === 'function') {
      const continuar = onBeforeConfirm({ motivo: cleanReason, reason: cleanReason, row, operacion });
      if (continuar === false) {
        return;
      }
    }

    setToastLocal(null);
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
      const elemento = showReason ? reasonRef.current : cancelRef.current;
      if (!elemento || typeof elemento.focus !== 'function') return;

      try {
        elemento.focus({ preventScroll: true });
      } catch (e) {
        elemento.focus();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [open, showReason]);

  useEffect(() => {
    if (!open) return undefined;

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
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, cerrar, isLoading, confirmDisabled, handleConfirm]);

  if (!open) return null;

  return createPortal(
    <>
      {toastLocal && (
        <Toast
          key={toastLocal.id}
          tipo={toastLocal.tipo}
          mensaje={toastLocal.mensaje}
          duracion={toastLocal.duracion}
          onClose={() => setToastLocal(null)}
        />
      )}

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
              ref={reasonRef}
              rows={3}
              value={reason}
              onChange={(event) => setReason(normalizarMayus(event.target.value))}
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
    </div>
    </>,
    document.body
  );
}
