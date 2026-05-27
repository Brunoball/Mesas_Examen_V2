import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import ModalContenidoGlobal from './ModalContenidoGlobal';
import '../Global_css/Global_Modals.css';

const textoSeguro = (valor, fallback = '—') => {
  const salida = String(valor ?? '').trim();
  return salida || fallback;
};

export default function TextoExpandibleGlobal({
  value,
  fallback = '—',
  title = 'Detalle completo',
  subtitle = '',
  className = '',
  textClassName = '',
  buttonClassName = '',
  modalCloseLabel = 'Cerrar',
}) {
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const text = textoSeguro(value, fallback);

  const checkOverflow = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const horizontalOverflow = el.scrollWidth > el.clientWidth + 1;
    const verticalOverflow = el.scrollHeight > el.clientHeight + 1;
    setIsOverflowing(horizontalOverflow || verticalOverflow);
  }, []);

  useEffect(() => {
    checkOverflow();
    const timer = setTimeout(checkOverflow, 0);

    const el = textRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && el
      ? new ResizeObserver(checkOverflow)
      : null;

    if (observer && el) observer.observe(el);

    window.addEventListener('resize', checkOverflow);
    window.addEventListener('orientationchange', checkOverflow);

    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener('resize', checkOverflow);
      window.removeEventListener('orientationchange', checkOverflow);
    };
  }, [text, checkOverflow]);

  const abrirModal = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <span className={`ginfo-inline ${className}`.trim()} title={text}>
        <span ref={textRef} className={`ginfo-inline__text ${textClassName}`.trim()}>
          {text}
        </span>

        {isOverflowing ? (
          <button
            type="button"
            className={`ginfo-inline__button ${buttonClassName}`.trim()}
            onClick={abrirModal}
            aria-label={`Ver contenido completo de ${title}`}
          >
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          </button>
        ) : null}
      </span>

      <ModalContenidoGlobal
        open={modalOpen}
        title={title}
        subtitle={subtitle}
        content={text}
        closeLabel={modalCloseLabel}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
