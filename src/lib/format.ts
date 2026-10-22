// Shared currency formatting so prices render identically everywhere instead of
// each component rolling its own helper.
export function formatEuro(value: number): string {
  const rounded = Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)));
  return `${rounded}€`;
}
