import { getUserDisplayName } from '../lib/users.js';

export default function MemberDropdown({
  value,
  options,
  placeholder,
  onChange,
  ariaLabel,
}) {
  const normalizedValue = String(value ?? '');

  return (
    <select
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
    >
      <option value="">{placeholder}</option>
      {options.map((member) => (
        <option key={member.id} value={String(member.id)}>
          {member.is_placeholder ? `${getUserDisplayName(member)} (Ej ansluten)` : getUserDisplayName(member)}
        </option>
      ))}
    </select>
  );
}
