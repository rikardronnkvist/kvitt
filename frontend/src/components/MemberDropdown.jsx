import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../lib/users.js';

function MemberAvatar({ member }) {
  const url = getUserAvatarUrl(member);
  const initials = getUserInitials(member);
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-muted)] text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-subtle)]">
      {url
        ? <img src={url} alt={initials} className="h-full w-full object-cover" loading="lazy" />
        : initials}
    </span>
  );
}

export default function MemberDropdown({
  value,
  options,
  placeholder,
  onChange,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const normalizedValue = String(value ?? '');
  const selected = options.find((m) => String(m.id) === normalizedValue) ?? null;

  useEffect(() => {
    if (!open) return;
    function handleOutside(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function handleSelect(memberId) {
    onChange(memberId);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-[0.95rem] py-[0.875rem] text-left text-[length:inherit] transition focus:border-[var(--accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
      >
        {selected
          ? <><MemberAvatar member={selected} /><span className="flex-1 truncate">{selected.is_placeholder ? `${getUserDisplayName(selected)} (Ej ansluten)` : getUserDisplayName(selected)}</span></>
          : <span className="flex-1 truncate text-[var(--text-muted)]">{placeholder}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-field)] border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] py-1 shadow-lg"
        >
          {options.map((member) => {
            const isActive = String(member.id) === normalizedValue;
            const label = member.is_placeholder
              ? `${getUserDisplayName(member)} (Ej ansluten)`
              : getUserDisplayName(member);
            return (
              <li
                key={member.id}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(String(member.id))}
                className={[
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]',
                ].join(' ')}
              >
                <MemberAvatar member={member} />
                <span className="truncate">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
