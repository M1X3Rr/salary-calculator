export const eur = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("sk-SK", { style: "currency", currency: "EUR" });

export const receivedAmountLabel = (n) => {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "Received amount: —";
  const amount = Number(n).toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Received amount: ${amount} €`;
};

export const parseReceived = (value) => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return null;
  return n;
};

export function loadTheme() {
  try {
    const saved = localStorage.getItem("salary-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}
