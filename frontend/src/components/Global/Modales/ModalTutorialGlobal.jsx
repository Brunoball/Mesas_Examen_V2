import React from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import '../Global_css/Global_Modals.css';

export default function ModalTutorialGlobal({
  titulo = 'Tutorial',
  descripcion = '',
  children,
  onCerrar,
}) {
  const tutorial = (
    <div className="gm-tutorialFloatLayer" role="presentation">
      <aside
        className="gm-tutorialCard"
        role="dialog"
        aria-modal="false"
        aria-labelledby="gm-tutorial-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gm-tutorialCard__head">
          <div className="gm-tutorialCard__icon" aria-hidden="true">
            <FontAwesomeIcon icon={faInfoCircle} />
          </div>

          <div className="gm-tutorialCard__titleBox">
            <h3 id="gm-tutorial-title">{titulo}</h3>
            {descripcion && <p>{descripcion}</p>}
          </div>

          <button
            type="button"
            className="gm-tutorialCard__close"
            onClick={onCerrar}
            aria-label="Cerrar ayuda"
            title="Cerrar ayuda"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="gm-tutorialCard__body">{children}</div>
      </aside>
    </div>
  );

  return createPortal(tutorial, document.body);
}
