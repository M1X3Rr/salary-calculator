const json = async (res) => {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
};

export const api = {
  report: () => fetch("/api/report").then(json),
  importFile: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/import", { method: "POST", body: fd }).then(json);
  },
  saveReceived: (payload) =>
    fetch("/api/received", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(json),
  saveSettings: (settings) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }).then(json),
  saveVacation: (payload) =>
    fetch("/api/vacation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(json),
  previewRate: (hourly_rate) =>
    fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourly_rate }),
    }).then(json),
  addShift: (payload) =>
    fetch("/api/shift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(json),
  updateShift: (payload) =>
    fetch("/api/shift", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(json),
  deleteShift: ({ date, start, end }) =>
    fetch(`/api/shift?date=${encodeURIComponent(date)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      method: "DELETE",
    }).then(json),
};

export const SETTINGS_LEADING = ["name", "department", "employer", "personal_no", "health_insurer"];

export const SETTING_HINTS = {
  name: "Your name on the dashboard header. Not taken from the hours export.",
  department: "Department shown under your name. Not taken from the hours export.",
  employer: "Employer shown under your name. Not taken from the hours export.",
  personal_no: "Employee / osobné číslo (for your reference; not used in the calc).",
  health_insurer: "Health insurance company (for your reference; not used in the calc).",
  hourly_rate: "Hourly wage used for základná mzda.",
  avg_earnings: "Average hourly earnings for holiday and OT príplatky. 0 uses the hourly rate.",
  employment_type: "part_time = študentská dohoda; full_time = TPP. Also switchable on Overview.",
  dohoda_type: "student = SP 4% + IP 3% on (hrubá − OOP); other dohoda types are not special-cased yet.",
  apply_nczd: "Apply the monthly non-taxable allowance (NČZD) before income tax.",
  apply_oop: "Apply the odvodová odpočítateľná položka on student dohoda before SP/IP.",
  oop: "OOP amount (€) subtracted from hrubá before SP and IP on a student dohoda.",
  contract_h_week: "Contracted hours per week. Part-time target is this ÷ 5 on each weekday.",
  contract_hours_week: "Unused duplicate of contract h week. Calculations use contract_h_week.",
  ot_enabled: "Unused. Part-time hours above the weekly target are always paid as OT.",
  rate_np: "Employee sick insurance (NP). 0 on študentská dohoda.",
  rate_sp: "Employee retirement insurance (SP).",
  rate_ip: "Employee disability insurance (IP).",
  rate_pvn: "Employee unemployment insurance (PvN). 0 on študentská dohoda.",
  rate_zp: "Employee health insurance (ZP). 0 on študentská dohoda.",
  nczd: "Monthly NČZD in € (2026 default 497.23).",
  tax19: "Income tax rate on the first bracket.",
  tax25: "Income tax rate on the second bracket.",
  tax30: "Income tax rate on the third bracket.",
  tax35: "Income tax rate above the last bracket.",
  bracket19: "Monthly taxable income up to this amount is taxed at 19%.",
  bracket25: "Monthly taxable income up to this amount is taxed at 25%.",
  bracket30: "Monthly taxable income up to this amount is taxed at 30%; above it at 35%.",
  prem_sat: "Saturday príplatok in € per hour.",
  prem_sun: "Sunday príplatok in € per hour.",
  prem_night: "Night príplatok in € per hour.",
  prem_hol_pct: "Public-holiday príplatok as a fraction of average earnings (1 = 100%).",
  prem_ot_pct: "Overtime príplatok as a fraction of average earnings (0.25 = 25%).",
  unpaid_break_after: "Clocked hours above this get an unpaid break deducted unless logged hours are set.",
  unpaid_break_hours: "Unpaid break length in hours (0.5 = 30 min) when the shift exceeds the threshold.",
  min_wage_month: "Monthly minimum wage (reference; príplatky use min wage hour).",
  min_wage_hour: "Hourly minimum wage used as the base for night/weekend príplatky.",
  full_time_shift_hours: "Hours per weekday for the full-time target (weekends, sviatky, and vacation excluded).",
  er_np: "Employer NP contribution rate.",
  er_sp: "Employer SP contribution rate.",
  er_ip: "Employer IP contribution rate.",
  er_pvn: "Employer PvN contribution rate.",
  er_pfp: "Employer guarantee insurance (Garančný fond) related rate on TPP.",
  er_up: "Employer accident insurance (úrazové) rate.",
  er_gp: "Employer solidarity reserve / related rate.",
  er_prfs: "Employer II. pillar / related rate.",
  er_zp: "Employer health insurance rate.",
};

export function hours(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  const totalMinutes = Math.round(Math.abs(n) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${n < 0 ? "-" : ""}${h}:${m} h`;
}

export function isOvernight(shift) {
  if (!shift?.start || !shift?.end) return false;
  return shift.end <= shift.start;
}

export function modeSubtitle(type) {
  return type === "full_time"
    ? "Pracovný pomer · employee 14.4% including ZP 5%"
    : "Študentská dohoda · 20 h/week · extra hours are OT · night & weekend príplatky apply · OOP 200 €";
}

export function calendarCells(year, month, shifts, holidays, vacationDates = [], vacationNotes = {}) {
  const holMap = Object.fromEntries((holidays || []).map((h) => [h.date, h.name]));
  const vacSet = new Set(vacationDates || []);
  const shiftMap = {};
  for (const shift of shifts || []) shiftMap[shift.work_date] = shift;
  const last = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= last; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, month - 1, day).getDay();
    const shift = shiftMap[iso] || null;
    const vacation = vacSet.has(iso);
    cells.push({
      day,
      iso,
      weekend: weekday === 0 || weekday === 6,
      holiday: holMap[iso] || null,
      shift,
      vacation,
      calledIn: vacation && !!shift,
      vacationNote: vacationNotes[iso] || "",
    });
  }
  return cells;
}
