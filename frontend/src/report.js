import { hours, modeSubtitle } from "./api.js";

const eur = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("sk-SK", { style: "currency", currency: "EUR" });

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function payslipLines(month, partTime) {
  if (!month) return [];
  return [
    ["Základná mzda", month.basic],
    ["Príplatok sobota", month.sat_prem],
    ["Príplatok nedeľa", month.sun_prem],
    ["Práca v noci", month.night_prem],
    ["Príplatok sviatok", month.holiday_prem],
    ...(month.ot_prem ? [["Príplatok nadčas (OT above weekly 20 h cap)", month.ot_prem]] : []),
    ["Osobné ohodnotenie", month.osobne],
    ["Hrubá mzda", month.hruba],
    ...(month.oop_applied ? [["OOP (študent, not taxed as pension base)", month.oop_applied]] : []),
    ["Nemocenské (NP 1.4%)", month.np],
    ["Starobné (SP 4%)", month.sp],
    ["Invalidné (IP 3%)", month.ip],
    ["Poist. v nezam. (PvN 1%)", month.pvn],
    ["Zdravotné (ZP 5%)", month.zp],
    ["Nezdaniteľná časť", month.nczd_applied],
    ["Daň", month.dan],
    ["Čistá mzda", month.cista],
    ["Celková cena práce", month.employer_cost],
  ];
}

function identity(profile) {
  const name = String(profile?.name || "").trim() || "Name Surname";
  const department = String(profile?.department || "").trim() || "Department";
  const employer = String(profile?.employer || "").trim() || "Employer";
  const personal = String(profile?.personal_no || "").trim();
  return { name, department, employer, personal };
}

function moneyClass(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  if (n > 0) return " pos";
  if (n < 0) return " neg";
  return "";
}

function wrapHtml({ title, heading, profile, mode, meta, body }) {
  const id = identity(profile);
  const generated = new Date().toLocaleString("sk-SK");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #1b241c; background: #f3efe6; margin: 0; padding: 32px; }
    .sheet { max-width: 920px; margin: 0 auto; background: #fffdf8; border: 1px solid #e4d9c8; border-radius: 12px; padding: 28px 32px 36px; }
    .brand { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5a; }
    h1 { margin: 6px 0 4px; font-size: 28px; }
    .who { margin: 0; color: #6b6258; font-weight: 600; }
    .meta { color: #6b6258; font-size: 13px; margin: 8px 0 22px; }
    h2 { font-size: 16px; margin: 28px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid #e4d9c8; }
    th { color: #6b6258; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 18px; }
    .kpi { border: 1px solid #e4d9c8; border-radius: 10px; padding: 12px; }
    .kpi .k { color: #6b6258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi .v { font-size: 20px; font-weight: 700; margin-top: 6px; }
    .gold { color: #9a7a32; }
    .pos { color: #1b7a4e; }
    .neg { color: #a33b2b; }
    .note { color: #6b6258; font-size: 12px; margin-top: 24px; }
    .emph td { font-weight: 700; }
    @media print {
      body { background: #fff; padding: 12mm; }
      .sheet { border: 0; max-width: none; border-radius: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="brand">Salary · 2026 SK payroll</div>
    <h1>${esc(heading)}</h1>
    <p class="who">${esc(id.name)} · ${esc(id.department)} · ${esc(id.employer)}${id.personal ? ` · ${esc(id.personal)}` : ""}</p>
    <p class="meta">${esc(modeSubtitle(mode))}${meta ? ` · ${esc(meta)}` : ""} · generated ${esc(generated)}</p>
    ${body}
    <p class="note">Local calculation only — not an official employer payslip. Use Print → Save as PDF for a PDF.</p>
  </article>
</body>
</html>`;
}

function kpi(label, value, extraClass = "") {
  return `<div class="kpi"><div class="k">${esc(label)}</div><div class="v${extraClass}">${esc(value)}</div></div>`;
}

function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function yearReportHtml({ year, profile, mode, months, totals, hoursLabel }) {
  const rows = (months || [])
    .map((m) => {
      const rec = m.received;
      const diff = rec == null ? null : rec - m.cista;
      return `<tr>
        <td>${esc(m.label)}</td>
        <td class="num">${esc(m.days)}</td>
        <td class="num">${esc(hours(m.hours))}</td>
        <td class="num">${esc(eur(m.hruba))}</td>
        <td class="num">${esc(eur(m.cista))}</td>
        <td class="num">${esc(eur(rec))}</td>
        <td class="num${moneyClass(diff)}">${esc(eur(diff))}</td>
      </tr>`;
    })
    .join("");
  const body = `
    <div class="kpis">
      ${kpi("Hours", hours(totals.hours))}
      ${kpi("Hrubá (brutto)", eur(totals.hruba), " gold")}
      ${kpi("Čistá (calculated)", eur(totals.cista))}
      ${kpi("Difference", eur(totals.diff), moneyClass(totals.diff))}
    </div>
    <p class="meta">${esc(hoursLabel || "")}</p>
    <h2>Months</h2>
    <table>
      <thead>
        <tr>
          <th>Month</th><th class="num">Days</th><th class="num">Hours</th>
          <th class="num">Brutto</th><th class="num">Netto</th>
          <th class="num">Received</th><th class="num">Difference</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7">No months in ${esc(year)}.</td></tr>`}</tbody>
    </table>`;
  return wrapHtml({
    title: `Salary overview ${year || ""}`.trim(),
    heading: `Overview ${year || ""}`.trim(),
    profile,
    mode,
    meta: `${(months || []).length} month(s)`,
    body,
  });
}

export function downloadYearReport(opts) {
  downloadHtml(`salary-overview-${opts.year || "year"}.html`, yearReportHtml(opts));
}

export function printYearReport(opts) {
  printHtml(yearReportHtml(opts));
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function downloadCsv(filename, rows) {
  const text = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
  };
}

export function downloadYearCsv({ year, months }) {
  const header = ["Month", "Days", "Hours", "Brutto", "Netto", "Received", "Difference"];
  const rows = (months || []).map((m) => {
    const rec = m.received;
    const diff = rec == null ? "" : rec - m.cista;
    return [m.label, m.days, m.hours, m.hruba, m.cista, rec ?? "", diff];
  });
  downloadCsv(`salary-overview-${year || "year"}.csv`, [header, ...rows]);
}

export function downloadMonthCsv({ month, partTime }) {
  if (!month) return;
  const rows = [["Line", "EUR"], ...payslipLines(month, partTime)];
  downloadCsv(`salary-payslip-${month.month}.csv`, rows);
}

export function monthReportHtml({ month, profile, mode, partTime, hoursLabel, received, difference }) {
  if (!month) return;
  const slip = payslipLines(month, partTime)
    .map(([label, value]) => {
      const emph = label === "Hrubá mzda" || label === "Čistá mzda";
      return `<tr class="${emph ? "emph" : ""}"><td>${esc(label)}</td><td class="num">${esc(eur(value))}</td></tr>`;
    })
    .join("");
  const vac = (month.vacation?.dates || []).join(", ");
  const shifts = (month.shifts || [])
    .map(
      (s) => `<tr>
        <td>${esc(s.work_date)}</td>
        <td>${esc(s.weekday)}</td>
        <td>${esc(s.start)}–${esc(s.end)}</td>
        <td class="num">${esc(hours(s.hours))}</td>
        <td class="num">${esc(hours(s.night_h))}</td>
        <td>${esc(s.holiday_name || s.day_type || "")}</td>
        <td class="num">${esc(eur(s.brutto))}</td>
      </tr>`
    )
    .join("");
  const body = `
    <div class="kpis">
      ${kpi("Hours", hours(month.hours))}
      ${kpi("Hrubá mzda", eur(month.hruba), " gold")}
      ${kpi("Čistá mzda", eur(month.cista))}
      ${kpi("Difference", eur(difference), moneyClass(difference))}
    </div>
    <p class="meta">${esc(hoursLabel || "")}${received != null ? ` · received ${eur(received)}` : ""}${month.note ? ` · ${month.note}` : ""}</p>
    <h2>Payslip · ${esc(month.label)}</h2>
    <table><tbody>${slip}</tbody></table>
    ${vac ? `<p class="meta">Vacation: ${esc(vac)}</p>` : ""}
    <h2>Shifts</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Day</th><th>Time</th>
          <th class="num">Hours</th><th class="num">Night</th>
          <th>Type</th><th class="num">Brutto</th>
        </tr>
      </thead>
      <tbody>${shifts || `<tr><td colspan="7">No shifts.</td></tr>`}</tbody>
    </table>`;
  return wrapHtml({
    title: `Payslip ${month.label}`,
    heading: month.label,
    profile,
    mode,
    meta: "single-month breakdown",
    body,
  });
}

export function downloadMonthReport(opts) {
  if (!opts?.month) return;
  downloadHtml(`salary-payslip-${opts.month.month}.html`, monthReportHtml(opts));
}

export function printMonthReport(opts) {
  if (!opts?.month) return;
  printHtml(monthReportHtml(opts));
}
