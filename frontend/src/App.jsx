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
import { api, calendarCells, hours, isOvernight, modeSubtitle, SETTING_HINTS } from "./api.js";
import { downloadMonthReport, downloadYearReport, payslipLines } from "./report.js";
import {
  STUB_GROUPS,
  isStubIncomplete,
  parseStub,
  settingsGroups,
  stubFromMonth,
} from "./stub.js";

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
  const [stubOpen, setStubOpen] = useState(false);
  const [weekView, setWeekView] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);
  const [shiftModal, setShiftModal] = useState(null);
  const [whatIf, setWhatIf] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("salary-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const applyReport = (report) => {
    setData(report);
    setSettingsDraft(report.settings);
  };

  const refreshCalc = async () => {
    const rate = Number(whatIf);
    if (whatIf !== "" && !Number.isNaN(rate) && rate > 0) {
      applyReport(await api.previewRate(rate));
      return;
    }
    applyReport(await api.report());
  };

  const load = async () => {
    const report = await api.report();
    applyReport(report);
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
  const monthStubDraft = monthDraft.stub || stubFromMonth(month);
  const monthIncomplete = isStubIncomplete(monthReceived, monthStubDraft);
  const monthWeeks = weeksOfMonth(month);

  const openStubFor = (key) => {
    if (key) setSelectedMonth(key);
    setTab("month");
    setStubOpen(true);
  };

  const applyWhatIf = async () => {
    setError("");
    try {
      await refreshCalc();
      setStatus(whatIf === "" ? "Preview cleared." : `Previewing ${whatIf} €/h (not saved).`);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveShift = async (payload) => {
    setError("");
    try {
      if (payload.delete && payload.old_date) {
        await api.deleteShift({ date: payload.old_date, start: payload.old_start, end: payload.old_end });
        setStatus("Shift deleted.");
      } else if (payload.old_date) {
        await api.updateShift(payload);
        setStatus("Shift updated.");
      } else {
        await api.addShift(payload);
        setStatus("Shift added.");
      }
      setShiftModal(null);
      await refreshCalc();
    } catch (e) {
      setError(e.message);
    }
  };

  const goMonth = (key) => {
    if (!key) return;
    setSelectedMonth(key);
    setSelectedDay(null);
    setYear(key.slice(0, 4));
    setWeekView(false);
    setWeekIndex(0);
  };

  const onImport = async (file) => {
    if (!file) return;
    setError("");
    setStatus("Importing…");
    try {
      const report = await api.importFile(file);
      applyReport(report);
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
      const payload = {
        month: m.month,
        received: parseReceived(Object.prototype.hasOwnProperty.call(draft, "received") ? draft.received : m.received),
        note: draft.note ?? m.note ?? "",
        osobne: draft.osobne === "" || draft.osobne == null ? m.osobne : Number(draft.osobne),
      };
      if (draft.stub) payload.stub = parseStub(draft.stub);
      await api.saveReceived(payload);
      await refreshCalc();
      setDrafts((prev) => {
        const cur = prev[m.month];
        if (!cur) return prev;
        const { received: _ignored, stub: _s, ...rest } = cur;
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
      await api.saveSettings(settingsDraft);
      await refreshCalc();
      setStatus("Settings saved. Totals recalculated.");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMode = async (next) => {
    setError("");
    try {
      await api.saveSettings({ ...data.settings, employment_type: next });
      await refreshCalc();
      setStatus(next === "full_time" ? "Switched to full-time (TPP)." : "Switched to part-time (študentská dohoda).");
    } catch (e) {
      setError(e.message);
    }
  };

  const saveVacation = async (monthKey, dates, notes) => {
    setError("");
    try {
      await api.saveVacation({ month: monthKey, dates, notes });
      await refreshCalc();
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
        {data.preview?.hourly_rate != null && (
          <p className="preview-banner">
            Preview at {data.preview.hourly_rate} €/h — not saved.
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setWhatIf("");
                api.report().then(applyReport).catch((e) => setError(e.message));
              }}
            >
              Clear preview
            </button>
          </p>
        )}

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
              <label>
                Preview €/h{" "}
                <input
                  type="number"
                  step="0.01"
                  style={{ width: 88 }}
                  placeholder={String(data.settings.hourly_rate || "")}
                  value={whatIf}
                  onChange={(e) => setWhatIf(e.target.value)}
                />
              </label>
              <button type="button" className="ghost" onClick={applyWhatIf}>
                Apply preview
              </button>
              <button
                type="button"
                className="ghost"
                disabled={months.length === 0}
                onClick={() => {
                  const reportMonths = months.map((m) => {
                    const d = drafts[m.month] || {};
                    return {
                      ...m,
                      received: parseReceived("received" in d ? d.received : m.received),
                    };
                  });
                  downloadYearReport({
                    year,
                    profile,
                    mode,
                    months: reportMonths,
                    totals,
                    hoursLabel: partTime
                      ? `${totals.workingDays} weekdays × ${partDailyLabel} h (${weekHours} h/week; vacation does not reduce target)`
                      : `${totals.workingDays} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
                  });
                  setStatus(`Downloaded overview report for ${year}.`);
                }}
              >
                Download year report
              </button>
            </div>
            <div className="cards">
              <Kpi label="Hours" value={hours(totals.hours)} />
              <Kpi label="Hrubá (brutto)" value={eur(totals.hruba)} tone="gold" />
              <Kpi label="Čistá (calculated)" value={eur(totals.cista)} />
              <Kpi
                label={receivedAmountLabel(totals.received)}
                value={
                  <span className="kpi-with-warn">
                    {eur(totals.diff)}
                    {months.some((m) => {
                      const d = drafts[m.month] || {};
                      const rec = parseReceived("received" in d ? d.received : m.received);
                      return isStubIncomplete(rec, d.stub || m.stub);
                    }) && (
                      <StubOpenButton
                        warn
                        onClick={() => {
                          const hit = months.find((m) => {
                            const d = drafts[m.month] || {};
                            const rec = parseReceived("received" in d ? d.received : m.received);
                            return isStubIncomplete(rec, d.stub || m.stub);
                          });
                          if (hit) openStubFor(hit.month);
                        }}
                        label="Not all payslip details were added"
                      />
                    )}
                  </span>
                }
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
                    const incomplete = isStubIncomplete(rec, d.stub || m.stub);
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
                          <span className="recv-cell">
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
                            {incomplete ? (
                              <StubOpenButton
                                warn
                                onClick={() => openStubFor(m.month)}
                                label="Not all payslip details were added"
                              />
                            ) : (
                              <StubOpenButton
                                onClick={() => openStubFor(m.month)}
                                label="Payslip stub details"
                              />
                            )}
                          </span>
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
                  <StubOpenButton
                    warn={monthIncomplete}
                    onClick={() => setStubOpen(true)}
                    label={
                      monthIncomplete
                        ? "Not all payslip details were added"
                        : "Payslip stub details"
                    }
                  />
                </span>
                <button className="primary" onClick={() => saveMonth(month)}>
                  Save received
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (weekView) {
                      setWeekView(false);
                      return;
                    }
                    setWeekIndex(0);
                    setWeekView(true);
                  }}
                >
                  {weekView ? "Back to month" : "Week view"}
                </button>
                <label>
                  Preview €/h{" "}
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: 88 }}
                    placeholder={String(data.settings.hourly_rate || "")}
                    value={whatIf}
                    onChange={(e) => setWhatIf(e.target.value)}
                  />
                </label>
                <button type="button" className="ghost" onClick={applyWhatIf}>
                  Apply preview
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    downloadMonthReport({
                      month,
                      profile,
                      mode,
                      partTime,
                      received: monthReceived,
                      difference: monthDiff,
                      hoursLabel: partTime
                        ? `${month.working_days ?? 0} weekdays × ${partDailyLabel} h (${weekHours} h/week; vacation does not reduce target)`
                        : `${month.working_days ?? 0} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
                    });
                    setStatus(`Downloaded payslip for ${month.label}.`);
                  }}
                >
                  Download payslip
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
            {weekView ? (
              <WeekView
                weeks={monthWeeks}
                weekIndex={Math.min(weekIndex, Math.max(0, monthWeeks.length - 1))}
                onIndex={setWeekIndex}
                partTime={partTime}
                shifts={(month.shifts || []).filter((s) => {
                  const w = monthWeeks[Math.min(weekIndex, Math.max(0, monthWeeks.length - 1))];
                  return w && s.work_date >= w.start && s.work_date <= w.end;
                })}
              />
            ) : (
              <>
            <div className="cards">
              <Kpi label="Hours" value={hours(month.hours)} />
              <Kpi label="Hrubá mzda" value={eur(month.hruba)} tone="gold" />
              <Kpi label="Čistá mzda" value={eur(month.cista)} />
              <Kpi
                label={receivedAmountLabel(monthReceived)}
                value={
                  <span className="kpi-with-warn">
                    {eur(monthDiff)}
                    {monthIncomplete ? (
                      <StubOpenButton
                        warn
                        onClick={() => setStubOpen(true)}
                        label="Not all payslip details were added"
                      />
                    ) : (
                      <StubOpenButton
                        onClick={() => setStubOpen(true)}
                        label="Payslip stub details"
                      />
                    )}
                  </span>
                }
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
                    {payslipLines(month, partTime).map(([k, v]) => (
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
                onAddShift={(iso) => setShiftModal({ date: iso, start: "08:00", end: "16:00", reported_hours: "" })}
                onEditShift={(shift) =>
                  setShiftModal({
                    date: shift.work_date,
                    start: shift.start,
                    end: shift.end,
                    reported_hours: shift.reported_hours ?? "",
                    old_date: shift.work_date,
                    old_start: shift.start,
                    old_end: shift.end,
                  })
                }
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
                    <th></th>
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
                      <td>
                        <button type="button" className="ghost" onClick={() =>
                          setShiftModal({
                            date: s.work_date,
                            start: s.start,
                            end: s.end,
                            reported_hours: s.reported_hours ?? "",
                            old_date: s.work_date,
                            old_start: s.start,
                            old_end: s.end,
                          })
                        }>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}
            {stubOpen && (
              <StubModal
                month={month}
                stub={monthStubDraft}
                onChange={(key, value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [month.month]: {
                      ...prev[month.month],
                      stub: { ...(prev[month.month]?.stub || monthStubDraft), [key]: value },
                    },
                  }))
                }
                onSave={() => {
                  saveMonth(month);
                }}
                onClose={() => setStubOpen(false)}
              />
            )}
          </>
        )}

        {shiftModal && (
          <ShiftModal
            draft={shiftModal}
            onChange={setShiftModal}
            onClose={() => setShiftModal(null)}
            onSave={saveShift}
          />
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
            {settingsGroups(settingsDraft).map((group) => (
              <section key={group.title} className="settings-group">
                <h3>{group.title}</h3>
                <div className="settings-grid">
                  {group.entries.map(([key, value]) => (
                    <FragmentRow
                      key={key}
                      name={key}
                      value={value}
                      hint={SETTING_HINTS[key]}
                      onChange={(v) => setSettingsDraft((s) => ({ ...s, [key]: v }))}
                    />
                  ))}
                </div>
              </section>
            ))}
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
  onAddShift,
  onEditShift,
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
            <div
              key={cell.iso}
              className={cls}
              role="button"
              tabIndex={0}
              aria-pressed={selectedIso === cell.iso}
              aria-label={`Select ${cell.iso}`}
              onClick={() => onSelect(cell.iso)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(cell.iso);
                }
              }}
            >
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
                <button
                  type="button"
                  className="cal-shift"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEditShift) onEditShift(shift);
                  }}
                >
                  <strong>
                    {shift.start}–{shift.end}
                  </strong>
                  {overnight && <span className="ov-tag">overnight</span>}
                  <span>{hours(shift.hours)}</span>
                </button>
              ) : (
                <>
                  {cell.vacation && <span className="vac-label">Vacation</span>}
                  <button
                    type="button"
                    className="cal-add"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddShift?.(cell.iso);
                    }}
                  >
                    + Add
                  </button>
                </>
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

function StubOpenButton({ onClick, label, warn = false }) {
  return (
    <button
      type="button"
      className={`stub-icon${warn ? " warn" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {warn ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.87 2.4c-.38-.68-1.36-.68-1.74 0L1.22 13.02c-.37.66.11 1.48.87 1.48h11.82c.76 0 1.24-.82.87-1.48L8.87 2.4zM8 6.2c.4 0 .72.33.7.73l-.18 3.4a.52.52 0 0 1-1.04 0l-.18-3.4A.7.7 0 0 1 8 6.2zm0 7.05a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.2 1.5h5.1L13 5.2v8.3c0 .83-.67 1.5-1.5 1.5h-7.3c-.83 0-1.5-.67-1.5-1.5V3c0-.83.67-1.5 1.5-1.5zm4.8.6v3.3h3.3L9 2.1zM5 8.1h6v1.1H5V8.1zm0 2.2h6v1.1H5v-1.1z"
          />
        </svg>
      )}
    </button>
  );
}

function weeksOfMonth(month) {
  const key = month?.month;
  const raw = month?.weeks || [];
  if (!key) return raw;
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthStart = `${key}-01`;
  const monthEnd = `${key}-${String(last).padStart(2, "0")}`;
  return raw.map((w, i) => ({
    ...w,
    week: i + 1,
    start: w.start < monthStart ? monthStart : w.start,
    end: w.end > monthEnd ? monthEnd : w.end,
  }));
}

function WeekView({ weeks, weekIndex, onIndex, partTime, shifts }) {
  if (!weeks?.length) {
    return <p className="sub">No weeks in this month.</p>;
  }
  const idx = Math.min(Math.max(0, weekIndex), weeks.length - 1);
  const w = weeks[idx];
  const prev = idx > 0 ? weeks[idx - 1] : null;
  const next = idx < weeks.length - 1 ? weeks[idx + 1] : null;
  const label = `Week ${idx + 1} · ${w.start} – ${w.end}`;
  const worked = shifts.reduce((n, s) => n + Number(s.hours || 0), 0);
  return (
    <>
      <div className="month-hop" role="group" aria-label="Previous or next week">
        <button
          type="button"
          className="ghost month-hop-btn"
          disabled={!prev}
          onClick={() => onIndex(idx - 1)}
        >
          ‹{prev ? ` Week ${idx}` : ""}
        </button>
        <span className="month-hop-now">{label}</span>
        <button
          type="button"
          className="ghost month-hop-btn"
          disabled={!next}
          onClick={() => onIndex(idx + 1)}
        >
          {next ? `Week ${idx + 2} ` : ""}›
        </button>
      </div>
      <HoursNeededBar
        worked={worked}
        needed={w.needed}
        extraHint={partTime ? "paid as OT" : ""}
        label={partTime ? "20 h/week contract" : "Weekly target"}
      />
      <div className="panel">
        <h3>Shifts this week</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Start</th>
              <th>End</th>
              <th>Hours</th>
              <th>Type</th>
              <th>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={7}>No shifts this week.</td>
              </tr>
            ) : (
              shifts.map((s) => (
                <tr key={`${s.work_date}-${s.start}`}>
                  <td>{s.work_date}</td>
                  <td>{s.weekday}</td>
                  <td>{s.start}</td>
                  <td>{s.end}</td>
                  <td>{hours(s.hours)}</td>
                  <td>{s.holiday_name || s.day_type}</td>
                  <td>{eur(s.brutto)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StubModal({ month, stub, onChange, onSave, onClose }) {
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal stub-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Payslip stub">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Payslip stub · {month.label}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="sub">
          Figures from the paper stub. Not used in the calculation — only to compare vs calc.
        </p>
        {STUB_GROUPS.map((group) => (
          <div key={group.title} className="stub-group">
            <h4>{group.title}</h4>
            <div className="stub-grid">
              {group.fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    step="any"
                    value={stub?.[field.key] ?? ""}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onSave();
              onClose();
            }}
          >
            Save stub
          </button>
        </p>
        <ReconcilePanel month={month} />
      </div>
    </div>
  );
}

function ReconcilePanel({ month }) {
  const rows = month?.reconcile?.rows || [];
  const extras = month?.reconcile?.extras || [];
  const notes = month?.explainer || [];
  if (!rows.length && !notes.length) return null;
  return (
    <div className="panel">
      <h3>Calc vs stub</h3>
      {notes.length > 0 && (
        <ul className="explainer">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>Calculated</th>
            <th>Stub</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{eur(row.calc)}</td>
              <td>{eur(row.stub)}</td>
              <td style={{ color: row.delta == null ? undefined : row.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                {eur(row.delta)}
              </td>
            </tr>
          ))}
          {extras.map((row) => (
            <tr key={row.label}>
              <td>{row.label}{row.qty != null ? ` (${row.qty})` : ""}</td>
              <td>—</td>
              <td>{eur(row.stub)}</td>
              <td>—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftModal({ draft, onChange, onClose, onSave }) {
  const editing = Boolean(draft.old_date);
  const reported =
    draft.reported_hours === "" || draft.reported_hours == null ? null : Number(draft.reported_hours);
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit shift">
        <h3>{editing ? "Edit shift" : "Add shift"}</h3>
        <label>
          Date
          <input
            type="date"
            value={draft.date}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
          />
        </label>
        <label>
          Start
          <input
            type="time"
            value={draft.start}
            onChange={(e) => onChange({ ...draft, start: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="time"
            value={draft.end}
            onChange={(e) => onChange({ ...draft, end: e.target.value })}
          />
        </label>
        <label>
          Logged hours (optional)
          <input
            type="number"
            step="0.01"
            value={draft.reported_hours}
            onChange={(e) => onChange({ ...draft, reported_hours: e.target.value })}
          />
        </label>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() =>
              onSave({
                date: draft.date,
                start: (draft.start || "").slice(0, 5),
                end: (draft.end || "").slice(0, 5),
                reported_hours: Number.isNaN(reported) ? null : reported,
                old_date: draft.old_date,
                old_start: draft.old_start?.slice(0, 5),
                old_end: draft.old_end?.slice(0, 5),
              })
            }
          >
            Save
          </button>
          {editing && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (window.confirm("Delete this shift?")) {
                  onSave({
                    delete: true,
                    old_date: draft.old_date,
                    old_start: draft.old_start,
                    old_end: draft.old_end,
                  });
                }
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
