export function sanitizePhoneInput(value) {
  return String(value ?? '').replace(/[^\d+\-\s]/g, '');
}

export function formatSwedishPhone(value) {
  const raw = sanitizePhoneInput(value).trim();
  if (!raw) return '';

  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0046')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('46')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 9) {
    return raw;
  }

  return `+46-${digits.slice(0, 2)}-${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}
