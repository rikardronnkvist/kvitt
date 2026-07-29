import { KeyRound } from 'lucide-react';

export default function PasskeyButton({ label, loadingLabel, loading, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-secondary w-full justify-start border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,white)]"
      disabled={disabled}
    >
      <KeyRound className="h-4 w-4 text-[var(--accent)]" />
      {loading ? loadingLabel : label}
    </button>
  );
}
