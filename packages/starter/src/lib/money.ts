export function currencyMinorDigits(currency: string) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits;
}

export function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency })
    .format(amountMinor / 10 ** currencyMinorDigits(currency));
}
