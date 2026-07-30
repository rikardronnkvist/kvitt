import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getUserDisplayName, getUserInitials } from '../lib/users.js';

export default function MemberDropdown({
  value,
  options,
  placeholder,
  onChange,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const normalizedValue = String(value ?? '');
  const selectedMember = useMemo(
    () => options.find((member) => String(member.id) === normalizedValue) || null,
    [options, normalizedValue],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (memberId) => {
    onChange(String(memberId));
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="flex min-h-[49px] w-full items-center justify-between rounded-[var(--radius-field)] border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3.5 py-2.5 text-left"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {selectedMember ? (
          <span className="inline-flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--app-surface-muted)] text-xs font-semibold text-[var(--text-secondary)]">
              {getUserInitials(selectedMember)}
            </span>
            <span>{getUserDisplayName(selectedMember)}</span>
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">{placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-1 shadow-[var(--shadow-strong)]" role="listbox">
          {options.map((member) => {
            const isSelected = String(member.id) === normalizedValue;
            return (
              <button
                key={member.id}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition ${isSelected ? 'bg-[var(--app-surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--app-surface-muted)]'}`}
                onClick={() => handleSelect(member.id)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--app-surface-muted)] text-xs font-semibold text-[var(--text-secondary)]">
                  {getUserInitials(member)}
                </span>
                <span>{getUserDisplayName(member)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
