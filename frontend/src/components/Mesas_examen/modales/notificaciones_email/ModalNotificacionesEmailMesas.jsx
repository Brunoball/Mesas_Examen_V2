import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faClock,
  faEnvelope,
  faPaperPlane,
  faRotate,
  faSpinner,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import "./ModalNotificacionesEmailMesas.css";
import {
  crearLoteNotificacionesEmailMesas,
  listarNotificacionesEmailMesas,
  obtenerEstadoLoteNotificacionesEmailMesas,
  procesarLoteNotificacionesEmailMesas,
} from "../../api/mesasExamenApi";

const texto = (valor, fallback = "-") => {
  const salida = String(valor ?? "").trim();
  return salida || fallback;
};

const estadoLabel = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  parcial: "Parcial",
  sin_mesa: "Sin mesa",
  email_invalido: "Email inválido",
};

const estadoClase = (estado = "") => {
  if (estado === "enviado") return "ok";
  if (estado === "pendiente" || estado === "parcial") return "warn";
  if (estado === "email_invalido") return "danger";
  return "muted";
};

const obtenerPayload = (res) => {
  if (res && Object.prototype.hasOwnProperty.call(res, "exito")) return res;
  if (res?.data && Object.prototype.hasOwnProperty.call(res.data, "exito")) return res.data;
  return res?.data || res || {};
};

const CardResumen = ({ label, value, hint, tone = "neutral" }) => (
  <div className={`mesasMail-card mesasMail-card--${tone}`}>
    <span>{label}</span>
    <strong>{value ?? 0}</strong>
    {hint ? <small>{hint}</small> : null}
  </div>
);

const MateriaItem = ({ materia }) => (
  <div className="mesasMail-materiaItem">
    <div>
      <strong>{texto(materia?.materia, "Materia sin nombre")}</strong>
      <span>{texto([materia?.curso, materia?.division].filter(Boolean).join(" "), "Curso sin especificar")}</span>
    </div>
    <div className="mesasMail-materiaDatos">
      <span>{texto(materia?.fecha_texto)}</span>
      <span>{texto(materia?.turno)}</span>
      <b>{texto(materia?.hora)}</b>
      <span>Mesa {texto(materia?.numero_mesa)}</span>
    </div>
  </div>
);

export default function ModalNotificacionesEmailMesas({ abierto = false, onClose, onToast }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [destinatarios, setDestinatarios] = useState([]);
  const [resumen, setResumen] = useState({});
  const [limites, setLimites] = useState({});
  const [lote, setLote] = useState(null);
  const [reenviar, setReenviar] = useState(false);
  const [asunto, setAsunto] = useState("Tu mesa de examen ya fue asignada");
  const [enviando, setEnviando] = useState(false);
  const [mensajeEnvio, setMensajeEnvio] = useState("");
  const cancelarRef = useRef(false);
  const montadoRef = useRef(false);

  const cargarDatos = useCallback(async () => {
    if (!abierto) return;
    setCargando(true);
    setError("");
    try {
      const res = await listarNotificacionesEmailMesas();
      const payload = obtenerPayload(res);
      const data = payload?.data || payload;
      setDestinatarios(Array.isArray(data?.destinatarios) ? data.destinatarios : []);
      setResumen(data?.resumen || {});
      setLimites(data?.limites || {});
      setLote(data?.ultimo_lote || null);
    } catch (err) {
      const msg = err?.message || "No se pudieron cargar las notificaciones.";
      setError(msg);
      onToast?.("error", msg, 3800);
    } finally {
      setCargando(false);
    }
  }, [abierto, onToast]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      cancelarRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (abierto) {
      cancelarRef.current = false;
      cargarDatos();
    }
  }, [abierto, cargarDatos]);

  const destinatariosVisibles = useMemo(() => {
    return destinatarios.slice().sort((a, b) => {
      const peso = { pendiente: 1, parcial: 2, enviado: 3, sin_mesa: 4, email_invalido: 5 };
      return (peso[a?.estado] || 9) - (peso[b?.estado] || 9) || texto(a?.alumno).localeCompare(texto(b?.alumno));
    });
  }, [destinatarios]);

  const statsLote = useMemo(() => {
    const total = Number(lote?.total_destinatarios || 0);
    const enviados = Number(lote?.enviados || 0);
    const pendientes = Number(lote?.pendientes || 0);
    const errores = Number(lote?.errores || 0);
    const porcentaje = Number(lote?.porcentaje || 0);
    return { total, enviados, pendientes, errores, porcentaje: Math.min(100, Math.max(0, porcentaje)) };
  }, [lote]);

  const procesarHastaTerminar = useCallback(async (idLote) => {
    let seguir = true;
    while (seguir && !cancelarRef.current) {
      const res = await procesarLoteNotificacionesEmailMesas({
        id_lote: idLote,
        limite: Number(limites?.batch_size_default || 20),
      });
      const payload = obtenerPayload(res);
      const data = payload?.data || payload;
      const loteActual = data?.lote || null;
      if (montadoRef.current && loteActual) setLote(loteActual);

      if (data?.limite_diario_alcanzado) {
        setMensajeEnvio(`Se alcanzó el límite diario configurado (${data.limite_diario || "-"} mails). El resto queda pendiente para continuar después.`);
        onToast?.("warning", "Se alcanzó el límite diario de envío. Podés continuar mañana o cuando se libere el límite.", 5200);
        break;
      }

      const pendientes = Number(loteActual?.pendientes || 0);
      seguir = pendientes > 0 && Number(data?.procesados_en_lote || 0) > 0;
      if (seguir) {
        setMensajeEnvio(`Enviando por lotes... quedan ${pendientes} pendientes.`);
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }, [limites?.batch_size_default, onToast]);

  const iniciarEnvio = useCallback(async () => {
    setError("");
    setMensajeEnvio("Preparando lote de envío...");
    setEnviando(true);
    cancelarRef.current = false;

    try {
      const resLote = await crearLoteNotificacionesEmailMesas({ reenviar, asunto });
      const payloadLote = obtenerPayload(resLote);
      if (payloadLote?.exito === false) {
        const msg = payloadLote?.mensaje || "No se pudo preparar el lote de notificaciones.";
        setError(msg);
        setMensajeEnvio("");
        onToast?.("warning", msg, 4200);
        return;
      }

      const dataLote = payloadLote?.data || payloadLote;
      const loteNuevo = dataLote?.lote || null;
      if (!loteNuevo?.id_lote) {
        throw new Error("El servidor no devolvió el identificador del lote.");
      }

      setLote(loteNuevo);
      setMensajeEnvio(`Enviando por lotes... ${loteNuevo.total_destinatarios || 0} destinatarios preparados.`);
      await procesarHastaTerminar(loteNuevo.id_lote);

      const estadoRes = await obtenerEstadoLoteNotificacionesEmailMesas({ id_lote: loteNuevo.id_lote });
      const payloadEstado = obtenerPayload(estadoRes);
      const loteFinal = (payloadEstado?.data || payloadEstado)?.lote || null;
      if (loteFinal) setLote(loteFinal);

      const errores = Number(loteFinal?.errores || 0);
      const pendientes = Number(loteFinal?.pendientes || 0);
      if (pendientes > 0) {
        setMensajeEnvio(`Quedaron ${pendientes} pendientes para continuar luego.`);
      } else if (errores > 0) {
        setMensajeEnvio(`Envío finalizado con ${errores} errores.`);
        onToast?.("warning", `Envío finalizado con ${errores} errores.`, 4200);
      } else {
        setMensajeEnvio("Envío finalizado correctamente.");
        onToast?.("exito", "Notificaciones enviadas correctamente.", 3500);
      }

      await cargarDatos();
    } catch (err) {
      const msg = err?.message || "No se pudo enviar el lote de notificaciones.";
      setError(msg);
      setMensajeEnvio("");
      onToast?.("error", msg, 4200);
    } finally {
      if (montadoRef.current) setEnviando(false);
    }
  }, [reenviar, asunto, onToast, procesarHastaTerminar, cargarDatos]);

  const cerrar = () => {
    if (enviando) {
      cancelarRef.current = true;
    }
    onClose?.();
  };

  if (!abierto) return null;

  const contenido = (
    <div className="mesasMail-backdrop" role="dialog" aria-modal="true">
      <div className="mesasMail-modal">
        <div className="mesasMail-head">
          <div>
            <span className="mesasMail-kicker"><FontAwesomeIcon icon={faEnvelope} /> Notificaciones</span>
            <h2>Notificar mesas asignadas</h2>
            <p>Envía un único email por DNI con todas las materias, fecha, turno, hora y mesa correspondiente.</p>
          </div>
          <button type="button" className="mesasMail-close" onClick={cerrar} title="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mesasMail-summary">
          <CardResumen label="Emails registrados" value={resumen?.total_destinatarios || 0} hint="1 por DNI inscripto" />
          <CardResumen label="Listos para enviar" value={resumen?.pendientes || 0} tone="warn" hint="Con mesa asignada" />
          <CardResumen label="Ya enviados" value={resumen?.enviados || 0} tone="ok" hint="No se repiten salvo reenvío" />
          <CardResumen label="Sin mesa / inválidos" value={(resumen?.sin_mesa || 0) + (resumen?.email_invalido || 0)} tone="danger" hint="No entran al lote" />
        </div>

        {lote?.id_lote ? (
          <div className="mesasMail-progressBox">
            <div className="mesasMail-progressTop">
              <div>
                <strong>Lote #{lote.id_lote}</strong>
                <span>{texto(lote.estado, "preparado")}</span>
              </div>
              <b>{statsLote.porcentaje}%</b>
            </div>
            <div className="mesasMail-progressBar" aria-label="Progreso de envío">
              <span style={{ width: `${statsLote.porcentaje}%` }} />
            </div>
            <div className="mesasMail-progressStats">
              <span><FontAwesomeIcon icon={faCheckCircle} /> Enviados: <b>{statsLote.enviados}</b></span>
              <span><FontAwesomeIcon icon={faClock} /> Pendientes: <b>{statsLote.pendientes}</b></span>
              <span><FontAwesomeIcon icon={faTriangleExclamation} /> Errores: <b>{statsLote.errores}</b></span>
              <span>Total: <b>{statsLote.total}</b></span>
            </div>
            {mensajeEnvio ? <p className="mesasMail-progressMsg">{mensajeEnvio}</p> : null}
          </div>
        ) : null}

        <div className="mesasMail-controls">
          <label className="mesasMail-field">
            <span>Asunto del email</span>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} disabled={enviando} />
          </label>
          <label className="mesasMail-check">
            <input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} disabled={enviando} />
            <span>Reenviar también a alumnos ya notificados</span>
          </label>
        </div>

        {error ? <div className="mesasMail-error"><FontAwesomeIcon icon={faTriangleExclamation} /> {error}</div> : null}

        <div className="mesasMail-listHead">
          <h3>Emails encontrados</h3>
          <button type="button" className="mesasMail-btn mesasMail-btn--ghost" onClick={cargarDatos} disabled={cargando || enviando}>
            <FontAwesomeIcon icon={cargando ? faSpinner : faRotate} spin={cargando} /> Actualizar
          </button>
        </div>

        <div className="mesasMail-list">
          {cargando ? (
            <div className="mesasMail-empty"><FontAwesomeIcon icon={faSpinner} spin /> Cargando emails...</div>
          ) : destinatariosVisibles.length === 0 ? (
            <div className="mesasMail-empty">Todavía no hay emails registrados desde el formulario de inscripción.</div>
          ) : destinatariosVisibles.map((dest) => (
            <article className="mesasMail-row" key={dest.id_inscripcion || `${dest.dni}-${dest.email}`}>
              <div className="mesasMail-rowMain">
                <div>
                  <strong>{texto(dest.alumno, "Alumno sin nombre")}</strong>
                  <span>DNI {texto(dest.dni)} · {texto(dest.email)}</span>
                </div>
                <span className={`mesasMail-badge mesasMail-badge--${estadoClase(dest.estado)}`}>{estadoLabel[dest.estado] || texto(dest.estado)}</span>
              </div>
              <div className="mesasMail-rowMeta">
                <span>{dest.total_materias || 0} materia/s inscriptas</span>
                <span>{dest.total_asignadas || 0} con mesa asignada</span>
                <span>{dest.total_notificadas || 0} notificadas</span>
              </div>
              <div className="mesasMail-materias">
                {(dest.materias || []).map((materia) => (
                  <MateriaItem key={materia.id_detalle || materia.id_previa || `${materia.materia}-${materia.fecha_mesa}`} materia={materia} />
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mesasMail-foot">
          <p>El envío usa cola por lotes para no pasar los límites del correo. Límite configurado: {limites?.daily_limit || 900} emails/día.</p>
          <button type="button" className="mesasMail-btn mesasMail-btn--primary" onClick={iniciarEnvio} disabled={enviando || cargando || (resumen?.pendientes || 0) <= 0 && !reenviar}>
            <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} />
            {enviando ? "Enviando por lotes..." : "Enviar notificaciones"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : contenido;
}
