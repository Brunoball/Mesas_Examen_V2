// src/components/Mesas_examen/modales/flechas/ModalMoverNumeroMesa.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCalendarAlt,
  faExchangeAlt,
  faLayerGroup,
  faSearch,
  faSpinner,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "./flechas.css";
import TextoExpandibleGlobal from "../../../Global/Modales/TextoExpandibleGlobal";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const normalizar = (valor) => String(valor || "").toLowerCase().trim();


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

const destinoCoincide = (destino, busqueda) => {
  if (!busqueda) return true;

  const valores = [
    destino.numero_grupo,
    destino.id_grupo,
    destino.fecha,
    destino.fecha_mesa,
    destino.turno,
    destino.area,
    destino.cantidad_numeros,
    destino.slots_libres,
  ];

  if (valores.some((valor) => normalizar(valor).includes(busqueda))) return true;

  const numeros = Array.isArray(destino.numeros) ? destino.numeros : [];
  return numeros.some((numero) => [
    numero.numero_mesa,
    numero.materia,
    numero.docente,
    numero.tipo_mesa,
  ].some((valor) => normalizar(valor).includes(busqueda)));
};

const ModalMoverNumeroMesa = ({
  abierto,
  numero,
  destinosData,
  cargando,
  moviendo,
  error,
  onClose,
  onConfirm,
}) => {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const overlayRef = useEscapeClose(abierto, onClose, moviendo);
  const confirmandoRef = useRef(false);

  const destinos = useMemo(() => {
    const textoBusqueda = normalizar(busqueda);
    const lista = Array.isArray(destinosData?.destinos) ? destinosData.destinos : [];
    return lista.filter((destino) => destinoCoincide(destino, textoBusqueda));
  }, [destinosData, busqueda]);

  useEffect(() => {
    if (abierto) {
      setBusqueda("");
      setSeleccionado(null);
      confirmandoRef.current = false;
    }
  }, [abierto, numero?.numero_mesa, destinosData?.numero_mesa]);

  if (!abierto) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const meta = destinosData?.meta || numero || {};

  const confirmar = () => {
    if (!seleccionado || moviendo || confirmandoRef.current) return;
    confirmandoRef.current = true;
    Promise.resolve(onConfirm?.(seleccionado))
      .catch(() => {
        // El hook ya muestra el error dentro del modal; evitamos que React muestre
        // el overlay rojo de "Uncaught runtime errors" por una promesa rechazada.
      })
      .finally(() => {
        confirmandoRef.current = false;
      });
  };

  return createPortal((
    <div ref={overlayRef} className="flechas-overlay" role="dialog" aria-modal="true" data-mesa-modal-root="true">
      <div className="flechas-modal">
        <header className="flechas-header flechas-header-compact">
          <div className="flechas-header-title">
            <span className="flechas-header-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faExchangeAlt} />
            </span>
            <div className="flechas-header-text">
              <h3>Mover número</h3>
              <div className="flechas-header-meta">
                <span>Mesa actual: <b>N° {texto(meta?.numero_mesa || numero?.numero_mesa)}</b></span>
                <span>Área destino: <b>{texto(meta?.area, "Sin área")}</b></span>
              </div>
            </div>
          </div>

          <button type="button" className="mesa-submodal-close" onClick={onClose} disabled={moviendo} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="flechas-body">
          <div className="flechas-info-card">
            <div className="flechas-dashboard-card flechas-dashboard-card--blue">
              <span className="flechas-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faCalendarAlt} /></span>
              <div className="flechas-dashboard-card__body">
                <span>Fecha sugerida</span>
                <strong>{texto(meta?.fecha || meta?.fecha_mesa)}</strong>
              </div>
            </div>
            <div className="flechas-dashboard-card flechas-dashboard-card--green">
              <span className="flechas-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faExchangeAlt} /></span>
              <div className="flechas-dashboard-card__body">
                <span>Turno sugerido</span>
                <strong>{texto(meta?.turno)}</strong>
              </div>
            </div>
            <div className="flechas-dashboard-card flechas-dashboard-card--purple">
              <span className="flechas-dashboard-card__icon" aria-hidden="true"><FontAwesomeIcon icon={faLayerGroup} /></span>
              <div className="flechas-dashboard-card__body">
                <span>Materia</span>
                <strong>
                  <TextoExpandibleGlobal value={meta?.materia} fallback="Sin materia" title="Materia" subtitle={`Mesa N° ${texto(meta?.numero_mesa || numero?.numero_mesa)}`} />
                </strong>
              </div>
            </div>
          </div>

          <div className="flechas-card">
            <h4>Grupo destino</h4>
            <p>
              Elegí a qué grupo querés mover esta mesa. Se muestran únicamente grupos del área con lugar disponible y sin choques de alumnos, docentes ni correlativas.
            </p>

            <label className="flechas-search">
              <span>Buscar grupo por materia, docente o número</span>
              <div>
                <FontAwesomeIcon icon={faSearch} />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ej: Matemática · Pérez · 120 · Grupo 5"
                />
              </div>
            </label>

            {error ? (
              <div className="flechas-error">{error}</div>
            ) : null}

            {cargando ? (
              <div className="flechas-loading">
                <FontAwesomeIcon icon={faSpinner} spin /> Analizando grupos compatibles...
              </div>
            ) : destinos.length === 0 ? (
              <div className="flechas-empty">
                No hay grupos disponibles para mover este número de mesa sin generar conflictos.
              </div>
            ) : (
              <div className="flechas-lista">
                {destinos.map((destino) => {
                  const activo = Number(seleccionado?.numero_grupo) === Number(destino.numero_grupo);
                  const numeros = Array.isArray(destino.numeros) ? destino.numeros : [];

                  return (
                    <div
                      className={`flechas-destino ${activo ? "activo" : ""} ${moviendo ? "is-disabled" : ""}`}
                      key={`destino-${destino.numero_grupo}`}
                      role="button"
                      tabIndex={moviendo ? -1 : 0}
                      aria-disabled={moviendo}
                      onClick={() => {
                        if (!moviendo) setSeleccionado(destino);
                      }}
                      onKeyDown={(event) => {
                        if (moviendo) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSeleccionado(destino);
                        }
                      }}
                    >
                      <div className="flechas-destino-top">
                        <div className="flechas-destino-title">
                          <span className="flechas-destino-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faLayerGroup} />
                          </span>
                          <div className="flechas-destino-heading">
                            <strong>Grupo {texto(destino.numero_grupo)}</strong>
                            <span>{texto(destino.fecha || destino.fecha_mesa)} · {texto(destino.turno)}</span>
                          </div>
                        </div>
                        <div className="flechas-libres">
                          <b>Libres: {destino.slots_libres ?? "-"}</b>
                          <span>
                            <TextoExpandibleGlobal value={destino.area} fallback="Sin área" title="Área destino" subtitle={`Grupo ${texto(destino.numero_grupo)}`} />
                          </span>
                        </div>
                      </div>

                      <div className="flechas-numeros">
                        <b>Mesas del grupo</b>
                        <ul>
                          {numeros.map((num) => (
                            <li key={`${destino.numero_grupo}-${num.numero_mesa}`}>
                              <strong>N° {texto(num.numero_mesa)}</strong>
                              <span className="flechas-numero-detail">
                                <TextoExpandibleGlobal value={num.materia} fallback="Sin materia" title="Materia del grupo" subtitle={`N° ${texto(num.numero_mesa)}`} />
                              </span>
                              <span className="flechas-numero-detail">
                                <TextoExpandibleGlobal value={num.docente} fallback="Sin docente" title="Docente del grupo" subtitle={`N° ${texto(num.numero_mesa)}`} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer className="flechas-footer">
          <button type="button" className="flechas-btn cancelar mesa-submodal-footer-close" onClick={onClose} disabled={moviendo}>
            Cerrar
          </button>
          <button type="button" className="flechas-btn mover" onClick={confirmar} disabled={!seleccionado || moviendo}>
            <FontAwesomeIcon icon={moviendo ? faSpinner : faCheck} spin={moviendo} />
            Mover
          </button>
        </footer>
      </div>
    </div>
  ), portalTarget);
};

export default ModalMoverNumeroMesa;
