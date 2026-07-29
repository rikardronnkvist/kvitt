import { X } from 'lucide-react';

export default function ModalShell({ title, description, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <section className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="m-0 text-xl font-semibold">{title}</h2>
              {description ? <p className="m-0 text-sm text-[var(--text-secondary)]">{description}</p> : null}
            </div>
            <button type="button" className="icon-button shrink-0" onClick={onClose} aria-label="Stäng">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
