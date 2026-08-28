import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, calendarCells, hours, isOvernight, modeSubtitle, SETTING_HINTS, settingsEntries } from "./api.js";

const eur = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("sk-SK", { style: "currency", currency: "EUR" });

const receivedAmountLabel = (n) => {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "Received amount: —";
  const amount = Number(n).toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Received amount: ${amount} €`;
};

const parseReceived = (value) => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return null;
  return n;
};

function loadTheme() {
  try {
    const saved = localStorage.getItem("salary-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}

function Kpi({ label, value, tone, keepCase }) {
  return (
    <div className="card">
      <div className={`k${keepCase ? " keep-case" : ""}`}>{label}</div>
      <div className={`v ${tone || ""}`}>{value}</div>
    </div>
  );
}

function HoursNeededBar({ worked, needed, label, extraHint }) {
  const w = Number(worked) || 0;
  const n = Number(needed) || 0;
  const pct = n > 0 ? Math.min(100, (w / n) * 100) : 0;
  const extra = w - n;
  const met = extra >= -1 / 60;
  return (
    <div className="need-bar">
      <div className="need-bar-head">
        <span>{label}</span>
        <strong>
          {hours(w)} / {hours(n)}
        </strong>
      </div>
      <div
        className="need-bar-track"
        role="progressbar"
        aria-label="Worked versus target hours"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`need-bar-fill${met ? " met" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="need-bar-meta">
        {n <= 0
          ? "No target hours this period."
          : extra >= 0
            ? `${hours(extra)} over target${extraHint ? ` · ${extraHint}` : ""}`
            : `${hours(-extra)} short of target`}
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [drafts, setDrafts] = useState({});
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("salary-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const load = async () => {
    const report = await api.report();
    setData(report);
    setSettingsDraft(report.settings);
    const years = report.years || [];
    setYear((y) => y || years[years.length - 1] || "");
    if (report.months?.length && !selectedMonth) {
      setSelectedMonth(report.months[report.months.length - 1].month);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const months = useMemo(() => {
    if (!data) return [];
    return data.months.filter((m) => !year || m.month.startsWith(year));
  }, [data, year]);

  const totals = useMemo(() => {
    const hruba = months.reduce((s, m) => s + m.hruba, 0);
    const cista = months.reduce((s, m) => s + m.cista, 0);
    const hours = months.reduce((s, m) => s + m.hours, 0);
    const neededHours = months.reduce((s, m) => s + (m.needed_hours || 0), 0);
    const workingDays = months.reduce((s, m) => s + (m.working_days || 0), 0);
    const withReceived = months.filter((m) => {
      const draft = drafts[m.month];
      const rec = parseReceived(draft && "received" in draft ? draft.received : m.received);
      return rec != null;
    });
    const received =
      withReceived.length === 0
        ? null
        : withReceived.reduce((s, m) => {
            const draft = drafts[m.month];
            return s + parseReceived(draft && "received" in draft ? draft.received : m.received);
          }, 0);
    const receivedCista = withReceived.reduce((s, m) => s + m.cista, 0);
    const diff = received == null ? null : received - receivedCista;
    return { hruba, cista, hours, neededHours, workingDays, received, diff };
  }, [months, drafts]);

  const month =
    (data?.months || []).find((m) => m.month === selectedMonth) ||
    months[0] ||
    data?.months?.[data.months.length - 1];
  const monthList = data?.months || [];
  const monthIndex = monthList.findIndex((m) => m.month === month?.month);
  const prevMonth = monthIndex > 0 ? monthList[monthIndex - 1] : null;
  const nextMonth = monthIndex >= 0 && monthIndex < monthList.length - 1 ? monthList[monthIndex + 1] : null;
  const monthDraft = (month && drafts[month.month]) || {};
  const monthReceived = parseReceived(
    month && Object.prototype.hasOwnProperty.call(monthDraft, "received")
      ? monthDraft.received
      : month?.received
  );
  const monthDiff = month == null || monthReceived == null ? null : monthReceived - month.cista;

  const goMonth = (key) => {
    if (!key) return;
    setSelectedMonth(key);
    setSelectedDay(null);
    setYear(key.slice(0, 4));
  };

  const onImport = async (file) => {
    if (!file) return;
    setError("");
    setStatus("Importing…");
    try {
      const report = await api.importFile(file);
      setData(report);
      setSettingsDraft(report.settings);
      const years = report.years || [];
      setYear(years[years.length - 1] || "");
      if (report.months?.length) setSelectedMonth(report.months[report.months.length - 1].month);
      setStatus(
        `Imported ${report.import_meta?.added ?? report.shift_count} shifts for ${report.import_meta?.employee || "you"}.`
      );
    } catch (e) {
      setError(e.message);
      setStatus("");
    }
  };

  const saveMonth = async (m) => {
    const draft = drafts[m.month] || {};
    setError("");
    try {
      const report = await api.saveReceived({
        month: m.month,
        received: parseReceived(Object.prototype.hasOwnProperty.call(draft, "received") ? draft.received : m.received),
        note: draft.note ?? m.note ?? "",
        osobne: draft.osobne === "" || draft.osobne == null ? m.osobne : Number(draft.osobne),
      });
      setData(report);
      setDrafts((prev) => {
        const cur = prev[m.month];
        if (!cur) return prev;
        const { received: _ignored, ...rest } = cur;
        return { ...prev, [m.month]: rest };
      });
      setStatus(`Saved ${m.label}.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveSettings = async () => {
    setError("");
    try {
      const report = await api.saveSettings(settingsDraft);
      setData(report);
      setStatus("Settings saved. Totals recalculated.");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMode = async (next) => {
    setError("");
    try {
      const report = await api.saveSettings({ ...data.settings, employment_type: next });
      setData(report);
      setSettingsDraft(report.settings);
      setStatus(next === "full_time" ? "Switched to full-time (TPP)." : "Switched to part-time (študentská dohoda).");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveVacation = async (monthKey, dates, notes) => {
    setError("");
    try {
      const report = await api.saveVacation({ month: monthKey, dates, notes });
      setData(report);
    } catch (e) {
      setError(e.message);
    }
  };

  const mode = data?.settings?.employment_type || "part_time";
  const partTime = mode !== "full_time";
  const shiftHours = Number(data?.settings?.full_time_shift_hours) || 8;
  const shiftLabel = Number.isInteger(shiftHours) ? String(shiftHours) : String(shiftHours);
  const weekHours = Number(data?.settings?.contract_h_week) || 20;
  const partDaily = weekHours / 5;
  const partDailyLabel = Number.isInteger(partDaily) ? String(partDaily) : partDaily.toFixed(1);
  const light = theme === "light";
  const chartMuted = light ? "#6b6258" : "#8ea0b8";
  const chartGrid = light ? "#e4d9c8" : "#2c4060";
  const profile = settingsDraft || data?.settings || {};
  const displayName = String(profile.name || "").trim() || "Name Surname";
  const displayDepartment = String(profile.department || "").trim() || "Department";
  const displayEmployer = String(profile.employer || "").trim() || "Employer";

  if (!data) {
    return <div className="main">{error || "Loading…"}</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Salary
          <span>Local dashboard · 2026 SK payroll</span>
        </div>
        <nav className="nav">
          {[
            ["overview", "Overview"],
            ["month", "Month / payslip"],
            ["import", "Import hours"],
            ["settings", "Settings"],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </aside>
      <main className="main">
        <h1>{displayName}</h1>
        <p className="identity">
          {displayDepartment}
          <span aria-hidden="true"> · </span>
          {displayEmployer}
        </p>
        <p className="sub">
          {data.shift_count} shifts stored
          {data.updated_at ? ` · updated ${data.updated_at}` : ""}
        </p>
        {error && <p className="err">{error}</p>}
        {status && <p className="msg">{status}</p>}

        {tab === "overview" && (
          <>
            <div className="row" style={{ marginBottom: 16 }}>
              <label>
                Year{" "}
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  {data.years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <ModeSwitch mode={mode} onChange={saveMode} />
            </div>
            <div className="cards">
              <Kpi label="Hours" value={hours(totals.hours)} />
              <Kpi label="Hrubá (brutto)" value={eur(totals.hruba)} tone="gold" />
              <Kpi label="Čistá (calculated)" value={eur(totals.cista)} />
              <Kpi
                label={receivedAmountLabel(totals.received)}
                value={eur(totals.diff)}
                tone={totals.diff == null ? "" : totals.diff >= 0 ? "green" : "red"}
                keepCase
              />
            </div>
            {months.length > 0 && (
              <HoursNeededBar
                worked={totals.hours || 0}
                needed={totals.neededHours || 0}
                extraHint={partTime ? "paid as OT" : ""}
                label={
                  partTime
                    ? `${totals.workingDays} weekdays × ${partDailyLabel} h (${weekHours} h/week; vacation does not reduce target)`
                    : `${totals.workingDays} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`
                }
              />
            )}
            <div className="panel" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chartMuted, fontSize: 11 }} />
                  <YAxis tick={{ fill: chartMuted, fontSize: 11 }} />
                  <Tooltip formatter={(v) => eur(v)} />
                  <Legend />
                  <Bar dataKey="hruba" name="Brutto" fill="#c4a35a" />
                  <Bar dataKey="cista" name="Calculated netto" fill="#3dcf8e" />
                  <Bar dataKey="received" name="Received" fill="#6ea8fe" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Days</th>
                    <th>Hours</th>
                    <th>Brutto</th>
                    <th>Netto</th>
                    <th>Received</th>
                    <th>Difference</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const d = drafts[m.month] || {};
                    const rec = parseReceived("received" in d ? d.received : m.received);
                    const difference = rec == null ? null : rec - m.cista;
                    return (
                      <tr key={m.month}>
                        <td>
                          <button className="ghost" onClick={() => { setSelectedMonth(m.month); setTab("month"); }}>
                            {m.label}
                          </button>
                        </td>
                        <td>{m.days}</td>
                        <td>{hours(m.hours)}</td>
                        <td>{eur(m.hruba)}</td>
                        <td>{eur(m.cista)}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            style={{ width: 110 }}
                            value={d.received ?? (m.received || "")}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [m.month]: { ...prev[m.month], received: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ color: difference == null ? undefined : difference >= 0 ? "var(--green)" : "var(--red)" }}>
                          {eur(difference)}
                        </td>
                        <td>
                          <input
                            style={{ width: 140 }}
                            value={d.note ?? m.note ?? ""}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [m.month]: { ...prev[m.month], note: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <button className="primary" onClick={() => saveMonth(m)}>
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "month" && month && (
          <>
            <div className="month-toolbar">
              <div className="row">
                <select
                  value={month.month}
                  onChange={(e) => goMonth(e.target.value)}
                >
                  {data.months.map((m) => (
                    <option key={m.month} value={m.month}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ModeSwitch mode={mode} onChange={saveMode} />
                <span>
                  Received{" "}
                  <input
                    type="number"
                    step="0.01"
                    value={(drafts[month.month]?.received ?? month.received) || ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [month.month]: { ...prev[month.month], received: e.target.value },
                      }))
                    }
                  />
                </span>
                <button className="primary" onClick={() => saveMonth(month)}>
                  Save received
                </button>
              </div>
              <div className="month-hop" role="group" aria-label="Previous or next month">
                <button
                  type="button"
                  className="ghost month-hop-btn"
                  disabled={!prevMonth}
                  onClick={() => goMonth(prevMonth?.month)}
                >
                  ‹{prevMonth ? ` ${prevMonth.label}` : ""}
                </button>
                <span className="month-hop-now">{month.label}</span>
                <button
                  type="button"
                  className="ghost month-hop-btn"
                  disabled={!nextMonth}
                  onClick={() => goMonth(nextMonth?.month)}
                >
                  {nextMonth ? `${nextMonth.label} ` : ""}›
                </button>
              </div>
            </div>
            <div className="cards">
              <Kpi label="Hours" value={hours(month.hours)} />
              <Kpi label="Hrubá mzda" value={eur(month.hruba)} tone="gold" />
              <Kpi label="Čistá mzda" value={eur(month.cista)} />
              <Kpi
                label={receivedAmountLabel(monthReceived)}
                value={eur(monthDiff)}
                tone={monthDiff == null ? "" : monthDiff >= 0 ? "green" : "red"}
                keepCase
              />
            </div>
            <HoursNeededBar
              worked={month.hours || 0}
              needed={month.needed_hours || 0}
              extraHint={partTime ? "paid as OT" : ""}
              label={
                partTime
                  ? `${month.working_days ?? 0} weekdays × ${partDailyLabel} h (${weekHours} h/week; vacation does not reduce target)`
                  : `${month.working_days ?? 0} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`
              }
            />
            <div className="month-split">
              <div className="panel payslip-panel">
                <h3>Payslip</h3>
                <table>
                  <tbody>
                    {[
                      ["Základná mzda", month.basic],
                      ["Príplatok sobota", month.sat_prem],
                      ["Príplatok nedeľa", month.sun_prem],
                      ["Práca v noci", month.night_prem],
                      ["Príplatok sviatok", month.holiday_prem],
                      ...(month.ot_prem || partTime
                        ? [["Príplatok nadčas (OT above 20 h/week)", month.ot_prem]]
                        : []),
                      ["Osobné ohodnotenie", month.osobne],
                      ["Hrubá mzda", month.hruba],
                      ...(month.oop_applied
                        ? [["OOP (študent, not taxed as pension base)", month.oop_applied]]
                        : []),
                      ["Nemocenské (NP 1.4%)", month.np],
                      ["Starobné (SP 4%)", month.sp],
                      ["Invalidné (IP 3%)", month.ip],
                      ["Poist. v nezam. (PvN 1%)", month.pvn],
                      ["Zdravotné (ZP 5%)", month.zp],
                      ["Nezdaniteľná časť", month.nczd_applied],
                      ["Daň", month.dan],
                      ["Čistá mzda", month.cista],
                      ["Celková cena práce", month.employer_cost],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{eur(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <MonthCalendar
                month={month}
                partTime={partTime}
                selectedIso={selectedDay}
                noteDraft={noteDraft}
                onSelect={(iso) => {
                  setSelectedDay(iso);
                  setNoteDraft(month.vacation?.notes?.[iso] || "");
                }}
                onToggleVac={(iso) => {
                  const vac = month.vacation || { dates: [], notes: {} };
                  const on = vac.dates.includes(iso);
                  const dates = on ? vac.dates.filter((d) => d !== iso) : [...vac.dates, iso].sort();
                  const notes = { ...vac.notes };
                  if (on) delete notes[iso];
                  saveVacation(month.month, dates, notes);
                  setSelectedDay(iso);
                  if (on) setNoteDraft("");
                }}
                onNoteChange={setNoteDraft}
                onSaveNote={() => {
                  if (!selectedDay) return;
                  const vac = month.vacation || { dates: [], notes: {} };
                  const notes = { ...vac.notes, [selectedDay]: noteDraft };
                  if (!noteDraft.trim()) delete notes[selectedDay];
                  saveVacation(month.month, vac.dates, notes);
                  setStatus("Vacation note saved.");
                }}
              />
            </div>
            <div className="panel">
              <h3>Shifts</h3>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Hours</th>
                    <th>Night</th>
                    <th>Type</th>
                    <th>Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {month.shifts.map((s) => (
                    <tr key={`${s.work_date}-${s.start}`}>
                      <td>{s.work_date}</td>
                      <td>{s.weekday}</td>
                      <td>{s.start}</td>
                      <td>{s.end}</td>
                      <td>{hours(s.hours)}</td>
                      <td>{hours(s.night_h)}</td>
                      <td>{s.holiday_name || s.day_type}</td>
                      <td>{eur(s.brutto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "import" && (
          <div className="panel">
            <div
              className="drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onImport(e.dataTransfer.files[0]);
              }}
            >
              <p>Drop an MCGA hours export here (.xls HTML calendar), or choose a file.</p>
              <input
                type="file"
                accept=".xls,.html,.htm"
                onChange={(e) => onImport(e.target.files[0])}
              />
            </div>
            <p className="sub">Days already stored for the same dates are replaced. Other months are kept.</p>
            {data.imports?.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>File</th>
                    <th>Employee</th>
                    <th>Shifts</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.imports].reverse().map((imp, i) => (
                    <tr key={i}>
                      <td>{imp.imported_at}</td>
                      <td>{imp.filename}</td>
                      <td>{imp.employee}</td>
                      <td>{imp.shift_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "settings" && settingsDraft && (
          <div className="panel">
            <div className="settings-grid">
              {settingsEntries(settingsDraft).map(([key, value]) => (
                <FragmentRow
                  key={key}
                  name={key}
                  value={value}
                  hint={SETTING_HINTS[key]}
                  onChange={(v) => setSettingsDraft((s) => ({ ...s, [key]: v }))}
                />
              ))}
            </div>
            <p>
              <button className="primary" onClick={saveSettings}>
                Save settings
              </button>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function ThemeSwitch({ theme, onChange }) {
  const dark = theme !== "light";
  return (
    <div className="theme-wrap">
      <div className="mode-switch" role="group" aria-label="Colour theme">
        <button type="button" className={!dark ? "active" : ""} onClick={() => onChange("light")}>
          Light
        </button>
        <button type="button" className={dark ? "active" : ""} onClick={() => onChange("dark")}>
          Dark
        </button>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }) {
  const partTime = mode !== "full_time";
  return (
    <div className="mode-wrap">
      <div className="mode-switch" role="group" aria-label="Employment type">
        <button type="button" className={partTime ? "active" : ""} onClick={() => onChange("part_time")}>
          Part-time
        </button>
        <button type="button" className={!partTime ? "active" : ""} onClick={() => onChange("full_time")}>
          Full-time
        </button>
      </div>
      <p className="mode-sub">{modeSubtitle(mode)}</p>
    </div>
  );
}

function MonthCalendar({
  month,
  partTime,
  selectedIso,
  noteDraft,
  onSelect,
  onToggleVac,
  onNoteChange,
  onSaveNote,
}) {
  const [year, monthNum] = month.month.split("-").map(Number);
  const vac = month.vacation || { dates: [], notes: {} };
  const cells = calendarCells(year, monthNum, month.shifts, month.holidays, vac.dates, vac.notes);
  const calledIn = cells.filter((c) => c?.calledIn);
  const selected = cells.find((c) => c?.iso === selectedIso) || null;
  const canNote = selected && selected.vacation;

  return (
    <div className="panel">
      <h3>Workdays</h3>
      {(vac.dates.length > 0 || calledIn.length > 0) && (
        <p className="vac-summary">
          {vac.dates.length} vacation {vac.dates.length === 1 ? "day" : "days"}
          {partTime ? " (does not reduce 20 h/week target)" : ""}
          {calledIn.length > 0 && (
            <>
              {" · "}
              <strong>{calledIn.length} called in</strong>
            </>
          )}
        </p>
      )}
      <div className="cal-head">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} className="cal-cell empty-cell" />;
          const shift = cell.shift;
          const overnight = isOvernight(shift);
          const cls = [
            "cal-cell",
            cell.weekend ? "weekend" : "",
            cell.holiday ? "holiday" : "",
            cell.vacation ? "vacation" : "",
            cell.calledIn ? "called-in" : "",
            shift ? "has-shift" : "",
            overnight ? "overnight" : "",
            selectedIso === cell.iso ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={cell.iso} className={cls}>
              <div className="cal-top">
                <span className="cal-num">{cell.day}</span>
                <button
                  type="button"
                  className={`vac-toggle${cell.vacation ? " on" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVac(cell.iso);
                  }}
                >
                  Vac
                </button>
              </div>
              {cell.holiday && <span className="hol-tag">{cell.holiday}</span>}
              {cell.calledIn && <span className="called-tag">Called in</span>}
              {shift ? (
                <button type="button" className="cal-shift" onClick={() => onSelect(cell.iso)}>
                  <strong>
                    {shift.start}–{shift.end}
                  </strong>
                  {overnight && <span className="ov-tag">overnight</span>}
                  <span>{hours(shift.hours)}</span>
                </button>
              ) : (
                cell.vacation && (
                  <button type="button" className="vac-label" onClick={() => onSelect(cell.iso)}>
                    Vacation
                  </button>
                )
              )}
              {cell.vacationNote && (
                <span className="cal-note" title={cell.vacationNote}>
                  {cell.vacationNote}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {canNote && (
        <div className="note-box">
          <label htmlFor="vac-note">
            Note for {selected.iso}
            {selected.calledIn ? " (called in)" : ""}
          </label>
          <textarea
            id="vac-note"
            rows={3}
            value={noteDraft}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Why you were off, or why you were called in…"
          />
          <button type="button" className="primary" onClick={onSaveNote}>
            Save note
          </button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ name, value, onChange, hint }) {
  const isBool = typeof value === "boolean";
  const isNum = typeof value === "number";
  const label = name.replaceAll("_", " ");
  return (
    <>
      <label htmlFor={name} className="setting-label">
        <span>{label}</span>
        {hint ? (
          <button type="button" className="tip" data-tip={hint} title={hint} aria-label={hint} />
        ) : null}
      </label>
      {isBool ? (
        <input
          id={name}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : (
        <input
          id={name}
          type={isNum ? "number" : "text"}
          step="any"
          value={value}
          onChange={(e) => onChange(isNum ? Number(e.target.value) : e.target.value)}
        />
      )}
    </>
  );
}
