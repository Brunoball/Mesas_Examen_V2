import React, { useEffect, useRef } from "react";
import "./AvisoPermisoExamen.css";

const AvisoPermisoExamen = ({ abierto, onCerrar }) => {
  const botonRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const overflowAnterior = document.body.style.overflow;
    const elementoAnterior = document.activeElement;

    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      botonRef.current?.focus();
    }, 80);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflowAnterior;

      if (
        elementoAnterior?.isConnected &&
        typeof elementoAnterior.focus === "function"
      ) {
        elementoAnterior.focus();
      }
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="aviso-permiso-overlay" role="presentation">
      <section
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
          ×
        </button>

        <div className="aviso-permiso-estado" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M9.55 17.35 4.7 12.5l1.6-1.6 3.25 3.25 8.15-8.15 1.6 1.6-9.75 9.75Z" />
          </svg>
        </div>

        <div className="aviso-permiso-encabezado">
          <p className="aviso-permiso-kicker">Inscripción confirmada</p>
          <h2 id="aviso-permiso-titulo">Importante para rendir</h2>
        </div>

        <div className="aviso-permiso-destacado">
          <div className="aviso-permiso-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 2h7l5 5v15H7V2Zm7 1.8V8h4.2L14 3.8ZM9 11v1.8h8V11H9Zm0 4v1.8h8V15H9Z" />
            </svg>
          </div>

          <p id="aviso-permiso-descripcion">
            Recordá que tenés que presentarte con el <strong>permiso de examen</strong>{" "}
            que te dieron en secretaría. Si no lo tenés, acercate a retirarlo.
          </p>
        </div>
        
        <button
          ref={botonRef}
          type="button"
          className="aviso-permiso-entendido"
          onClick={onCerrar}
        >
          Entendido, cerrar aviso
        </button>
      </section>
    </div>
  );
};

export default AvisoPermisoExamen;
