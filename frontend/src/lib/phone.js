export function sanitizePhoneInput(value) {
  return String(value ?? '').replace(/[^\d+\-\s]/g, '');
}

function normalizeSwedishDigits(value) {
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

  return digits;
}

function normalizeNorwegianDigits(value) {
  const raw = sanitizePhoneInput(value).trim();
  if (!raw) return '';

  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0047')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('47')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 9) {
    digits = digits.slice(1);
  }

  if (digits.length !== 8) {
    return raw;
  }

  return digits;
}

export function formatPhoneNumber(value, format = 'swedish') {
  if (format === 'norwegian') {
    const digits = normalizeNorwegianDigits(value);
    if (!digits) return '';
    if (digits.length !== 8) {
      return sanitizePhoneInput(value).trim();
    }
    return `+47 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)}`;
  }

  const digits = normalizeSwedishDigits(value);
  if (!digits) return '';
  if (digits.length !== 9) {
    return sanitizePhoneInput(value).trim();
  }

  if (format === 'international') {
    return `+46 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }

  if (format === 'national') {
    return `0${digits.slice(0, 2)}-${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }

  return `+46-${digits.slice(0, 2)}-${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}

export function getPhonePlaceholder(format = 'swedish') {
  if (format === 'norwegian') {
    return '+47 123 45 678';
  }
  if (format === 'international') {
    return '+46 70 123 45 67';
  }
  if (format === 'national') {
    return '070-123 45 67';
  }
  return '+46-70-123 45 67';
}

export function formatSwedishPhone(value) {
  return formatPhoneNumber(value, 'swedish');
}
