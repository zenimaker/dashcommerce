export function currencyMinorDigits(currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits;
}

export function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency })
    .format(amountMinor / 10 ** currencyMinorDigits(currency));
}
