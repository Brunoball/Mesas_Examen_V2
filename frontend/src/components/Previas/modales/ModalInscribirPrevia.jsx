import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faEnvelope,
  faSpinner,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import '../../Global/Global_css/Global_Modals.css';
import Toast from '../../Global/Toast.jsx';
import './ModalPrevias.css';

function safeText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function normalizarMaterias(materias = []) {
  return (Array.isArray(materias) ? materias : [])
    .map((item) => ({
      ...item,
      id_previa: Number(item.id_previa || 0),
      materia: safeText(item.materia || item.materia_nombre),
      curso_materia: safeText(item.curso_materia || `${item.curso || ''} ${item.division || ''}`.trim()),
      principal: Number(item.principal || 0) === 1,
    }))
    .filter((item) => item.id_previa > 0);
}

export default function ModalInscribirPrevia({
  open,
  data,
  loading = false,
  saving = false,
  error = '',
  onClose,
  onConfirm,
  onToast,
}) {
  const materias = useMemo(() => normalizarMaterias(data?.materias), [data]);
  const principal = useMemo(() => materias.find((m) => m.principal) || materias[0] || null, [materias]);
  const [email, setEmail] = useState('');
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [toastLocal, setToastLocal] = useState(null);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 4200) => {
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
  }, [onToast]);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setToastLocal(null);
    setSeleccionadas(principal?.id_previa ? [principal.id_previa] : []);
  }, [open, principal?.id_previa]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, saving, onClose]);

  useEffect(() => {
    if (!open || !error) return;
    mostrarToast('error', error, 5200);
  }, [open, error, mostrarToast]);

  if (!open) return null;

  const alumno = safeText(data?.alumno || principal?.alumno);
  const dni = safeText(data?.dni || principal?.dni);
  const materiaPrincipal = safeText(data?.materia_principal || principal?.materia);
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const puedeConfirmar = !loading && !saving && seleccionadas.length > 0 && emailValido;

  const toggleMateria = (idPrevia) => {
    if (saving) return;
    setSeleccionadas((prev) => {
      if (prev.includes(idPrevia)) {
        return prev.filter((id) => id !== idPrevia);
      }
      return [...prev, idPrevia];
    });
  };

  const confirmar = async () => {
    if (saving || loading) return;

    if (seleccionadas.length === 0) {
      mostrarToast('advertencia', 'Seleccioná al menos una materia para inscribir.', 5200);
      return;
    }

    if (!emailValido) {
      mostrarToast('advertencia', 'Ingresá un email válido para enviar el comprobante.', 5200);
      return;
    }

    setToastLocal(null);
    await onConfirm?.({ idsPrevias: seleccionadas, gmail: email.trim() });
  };

  const contenido = (
    <div className="previas-insc-backdrop" role="presentation">
      <div className="previas-insc-modal" role="dialog" aria-modal="true" aria-labelledby="previas-insc-title">
        <div className="previas-insc-head">
          <div className="previas-insc-head__title">
            <span className="previas-insc-head__icon"><FontAwesomeIcon icon={faCheckCircle} /></span>
            <h2 id="previas-insc-title">Confirmar inscripción</h2>
          </div>
          <button type="button" className="previas-insc-close" onClick={onClose} disabled={saving} aria-label="Cerrar modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="previas-insc-body">
          {loading ? (
            <div className="previas-insc-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Cargando materias del alumno...
            </div>
          ) : (
            <>
              <p className="previas-insc-question">
                ¿Querés inscribir manualmente a este alumno/a en las materias seleccionadas?
              </p>

              <div className="previas-insc-studentCard">
                <strong>{alumno}</strong>
                <span>— DNI {dni}</span>
                <small>Materia principal: {materiaPrincipal}</small>
              </div>

              <label className="previas-insc-field">
                <span>Email del alumno/a para enviar comprobante</span>
                <div className="previas-insc-emailWrap">
                  <FontAwesomeIcon icon={faEnvelope} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ejemplo@correo.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              <div className="previas-insc-materiasBlock">
                <h3>Materias a inscribir</h3>
                <div className="previas-insc-materiasGrid">
                  {materias.map((materia) => {
                    const selected = seleccionadas.includes(materia.id_previa);
                    return (
                      <button
                        key={materia.id_previa}
                        type="button"
                        className={`previas-insc-materiaCard ${selected ? 'is-selected' : ''}`}
                        onClick={() => toggleMateria(materia.id_previa)}
                      >
                        <span className="previas-insc-materiaCheck" aria-hidden="true" />
                        <span className="previas-insc-materiaText">
                          <strong>{safeText(materia.materia)}</strong>
                          <small>{safeText(materia.curso_materia)}</small>
                        </span>
                        {materia.principal && <em>Principal</em>}
                      </button>
                    );
                  })}
                </div>
              </div>

            </>
          )}
        </div>

        <div className="previas-insc-actions">
          <button type="button" className="previas-insc-btn previas-insc-btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="previas-insc-btn previas-insc-btn--primary" onClick={confirmar} disabled={!puedeConfirmar}>
            {saving ? <><FontAwesomeIcon icon={faSpinner} spin /> Inscribiendo...</> : 'Inscribir'}
          </button>
        </div>
      </div>
    </div>
  );

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
      {contenido}
    </>,
    document.body
  );
}
