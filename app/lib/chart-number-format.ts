/** Keep small signed currents and closely spaced voltage ticks legible instead of rounding to zero. */
export function axisNumberFormat(span: number): Intl.NumberFormat {
  const step = Math.abs(span) / 5;
  const decimals = step > 0 ? Math.max(2, Math.min(10, Math.ceil(-Math.log10(step)) + 1)) : 2;
  return new Intl.NumberFormat('en-GB', step > 0 && step < 1e-9
    ? {notation: 'scientific', maximumFractionDigits: 3}
    : {maximumFractionDigits: decimals});
}
