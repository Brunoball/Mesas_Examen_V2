// src/components/Mesas_examen/modales/flechas/ModalMoverNumeroMesa.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faExchangeAlt,
  faSearch,
  faSpinner,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import "./flechas.css";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const normalizar = (valor) => String(valor || "").toLowerCase().trim();

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

  const destinos = useMemo(() => {
    const textoBusqueda = normalizar(busqueda);
    const lista = Array.isArray(destinosData?.destinos) ? destinosData.destinos : [];
    return lista.filter((destino) => destinoCoincide(destino, textoBusqueda));
  }, [destinosData, busqueda]);

  useEffect(() => {
    if (abierto) {
      setBusqueda("");
      setSeleccionado(null);
    }
  }, [abierto, numero?.numero_mesa, destinosData?.numero_mesa]);

  if (!abierto) return null;

  const meta = destinosData?.meta || numero || {};

  const confirmar = () => {
    if (!seleccionado || moviendo) return;
    onConfirm?.(seleccionado);
  };

  return (
    <div className="flechas-overlay" role="dialog" aria-modal="true">
      <div className="flechas-modal">
        <header className="flechas-header">
          <div>
            <h3>
              <FontAwesomeIcon icon={faExchangeAlt} />
              Mover número {texto(meta?.numero_mesa || numero?.numero_mesa)}
            </h3>
            <p>
              Fecha sugerida: <b>{texto(meta?.fecha || meta?.fecha_mesa)}</b> · Turno sugerido: <b>{texto(meta?.turno)}</b>
            </p>
            <p className="flechas-meta-line">
              Área: <b>{texto(meta?.area, "Sin área")}</b> · Materia: <b>{texto(meta?.materia, "Sin materia")}</b>
            </p>
          </div>

          <button type="button" onClick={onClose} disabled={moviendo} aria-label="Cerrar">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <section className="flechas-body">
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

            {error && <div className="flechas-error">{error}</div>}

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
                    <button
                      type="button"
                      className={`flechas-destino ${activo ? "activo" : ""}`}
                      key={`destino-${destino.numero_grupo}`}
                      onClick={() => setSeleccionado(destino)}
                      disabled={moviendo}
                    >
                      <div className="flechas-destino-top">
                        <div>
                          <strong>Grupo {texto(destino.numero_grupo)}</strong>
                          <span>{texto(destino.fecha || destino.fecha_mesa)} · {texto(destino.turno)}</span>
                        </div>
                        <div className="flechas-libres">
                          <b>Libres: {destino.slots_libres ?? "-"}</b>
                          <span>{texto(destino.area, "Sin área")}</span>
                        </div>
                      </div>

                      <div className="flechas-numeros">
                        <b>Mesas del grupo</b>
                        <ul>
                          {numeros.map((num) => (
                            <li key={`${destino.numero_grupo}-${num.numero_mesa}`}>
                              <strong>N° {texto(num.numero_mesa)}</strong>: {texto(num.materia, "Sin materia")} — {texto(num.docente, "Sin docente")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer className="flechas-footer">
          <button type="button" className="flechas-btn cancelar" onClick={onClose} disabled={moviendo}>
            Cancelar
          </button>
          <button type="button" className="flechas-btn mover" onClick={confirmar} disabled={!seleccionado || moviendo}>
            <FontAwesomeIcon icon={moviendo ? faSpinner : faCheck} spin={moviendo} />
            Mover
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModalMoverNumeroMesa;
