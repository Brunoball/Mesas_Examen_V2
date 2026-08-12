import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./AvisoPermisoExamen.css";

const AvisoPermisoExamen = ({ abierto, onCerrar }) => {
  const modalRef = useRef(null);
  const botonRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const overflowAnterior = document.body.style.overflow;
    const elementoAnterior = document.activeElement;

    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      botonRef.current?.focus({ preventScroll: true });
    }, 0);

    const manejarTeclado = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCerrar?.();
        return;
      }

      if (event.key !== "Tab") return;

      const controles = modalRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!controles?.length) return;

      const primero = controles[0];
      const ultimo = controles[controles.length - 1];

      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", manejarTeclado, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", manejarTeclado, true);
      document.body.style.overflow = overflowAnterior;

      if (
        elementoAnterior?.isConnected &&
        typeof elementoAnterior.focus === "function"
      ) {
        elementoAnterior.focus();
      }
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return createPortal(
    <div className="aviso-permiso-overlay" role="presentation">
      <section
        ref={modalRef}
        className="aviso-permiso-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aviso-permiso-titulo"
        aria-describedby="aviso-permiso-descripcion"
      >
        <button
          type="button"
          className="aviso-permiso-cerrar"
          onClick={onCerrar}
          aria-label="Cerrar aviso importante"
          title="Cerrar"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
          </svg>
        </button>

        <div className="aviso-permiso-estado" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M9.55 17.35 4.7 12.5l1.6-1.6 3.25 3.25 8.15-8.15 1.6 1.6-9.75 9.75Z" />
          </svg>
        </div>

        <div className="aviso-permiso-encabezado">
          <p className="aviso-permiso-kicker">Inscripción confirmada</p>
          <h2 id="aviso-permiso-titulo">Importante para rendir</h2>
          <p className="aviso-permiso-bajada">
            Tu inscripción se registró correctamente.
          </p>
        </div>

        <div className="aviso-permiso-destacado">
          <div className="aviso-permiso-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 2h7l5 5v15H7V2Zm7 1.8V8h4.2L14 3.8ZM9 11v1.8h8V11H9Zm0 4v1.8h8V15H9Z" />
            </svg>
          </div>

          <div className="aviso-permiso-mensaje">
            <strong>Antes de rendir</strong>
            <p id="aviso-permiso-descripcion">
              Recordá que tenés que presentarte con el{" "}
              <strong>permiso de examen</strong> que te dieron en secretaría. Si
              no lo tenés, acercate a retirarlo.
            </p>
          </div>
        </div>

        <div className="aviso-permiso-acciones">
          <button
            ref={botonRef}
            type="button"
            className="aviso-permiso-entendido"
            onClick={onCerrar}
          >
            Entendido, cerrar aviso
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default AvisoPermisoExamen;
