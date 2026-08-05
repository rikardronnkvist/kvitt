import { X } from 'lucide-react';
import { t } from '../lib/i18n.js';

export default function ModalShell({ title, description, onClose, children }) {
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop app-shell-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={handleBackdropClick}>
      <div className="modal-sheet app-shell-modal-sheet">
        <section className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="m-0 text-xl font-semibold">{title}</h2>
              {description ? <p className="m-0 text-sm text-[var(--text-secondary)]">{description}</p> : null}
            </div>
            <button type="button" className="icon-button shrink-0" onClick={onClose} aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
