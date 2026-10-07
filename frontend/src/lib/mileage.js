// Default mileage reimbursement (kr/mil) for the Bil category.
// Matches Skatteverket's tax-free standard rate for using a private car, 25 kr/mil
// (unchanged since 2023). Keep in sync with backend/src/utils/mileage.js.
// https://www.skatteverket.se/privat/skatter/beloppochprocent/2026
export const DEFAULT_MILEAGE_RATE = 25;

export function resolveMileageRate(value) {
  const numeric = Number(value);
  return numeric > 0 ? numeric : DEFAULT_MILEAGE_RATE;
}
