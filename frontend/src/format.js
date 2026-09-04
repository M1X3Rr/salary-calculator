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
  if (typeof value === "number") {
    if (Number.isNaN(value) || value === 0) return null;
    return value;
  }
  let s = String(value).trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
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
