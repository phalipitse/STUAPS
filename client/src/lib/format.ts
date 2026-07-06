export function formatRand(amount: number): string {
  const abs = Math.abs(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `(R${abs})` : `R${abs}`;
}
