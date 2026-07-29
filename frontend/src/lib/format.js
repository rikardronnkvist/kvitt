const currencyFormatter = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const preciseCurrencyFormatter = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount, { precise = false } = {}) {
  const value = Number(amount) || 0;
  return (precise ? preciseCurrencyFormatter : currencyFormatter).format(value);
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMonthYear(value = new Date()) {
  return new Date(value).toLocaleString('sv-SE', {
    month: 'long',
    year: 'numeric',
  });
}
