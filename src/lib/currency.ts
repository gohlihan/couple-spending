const MYR_FORMATTER = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format all user-facing money as Malaysian ringgit (RM). */
export function formatCurrency(amount: number): string {
  // Intl uses a non-breaking space between the symbol and amount in en-MY;
  // normalize it so copied text and accessibility output read as "RM 100.00".
  return MYR_FORMATTER.format(amount).replace(/\u00a0/g, ' ');
}
