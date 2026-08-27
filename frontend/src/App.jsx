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
import { api } from "./api.js";

const eur = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("sk-SK", { style: "currency", currency: "EUR" });
const hrs = (n) => (n == null ? "—" : `${Number(n).toFixed(2)} h`);

function Kpi({ label, value, tone }) {
  return (
    <div className="card">
      <div className="k">{label}</div>
      <div className={`v ${tone || ""}`}>{value}</div>
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
    const received = months.every((m) => m.received == null)
      ? null
      : months.reduce((s, m) => s + (m.received || 0), 0);
    const diff = received == null ? null : received - cista;
    return { hruba, cista, hours, received, diff };
  }, [months]);

  const month = months.find((m) => m.month === selectedMonth) || months[0];

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
        received: draft.received === "" || draft.received == null ? m.received : Number(draft.received),
        note: draft.note ?? m.note ?? "",
        osobne: draft.osobne === "" || draft.osobne == null ? m.osobne : Number(draft.osobne),
      });
      setData(report);
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

  if (!data) {
    return <div className="main">{error || "Loading…"}</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          MCGA Salary
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
      </aside>
      <main className="main">
        <h1>{data.employee || data.settings.name}</h1>
        <p className="sub">
          {data.shift_count} shifts stored
          {data.updated_at ? ` · updated ${data.updated_at}` : ""} · {data.settings.employer}
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
            </div>
            <div className="cards">
              <Kpi label="Hours" value={hrs(totals.hours)} />
              <Kpi label="Hrubá (brutto)" value={eur(totals.hruba)} tone="gold" />
              <Kpi label="Čistá (calculated)" value={eur(totals.cista)} />
              <Kpi
                label="Received − calculated"
                value={eur(totals.diff)}
                tone={totals.diff == null ? "" : totals.diff >= 0 ? "green" : "red"}
              />
            </div>
            <div className="panel" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months}>
                  <CartesianGrid stroke="#2c4060" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8ea0b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#8ea0b8", fontSize: 11 }} />
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
                    return (
                      <tr key={m.month}>
                        <td>
                          <button className="ghost" onClick={() => { setSelectedMonth(m.month); setTab("month"); }}>
                            {m.label}
                          </button>
                        </td>
                        <td>{m.days}</td>
                        <td>{hrs(m.hours)}</td>
                        <td>{eur(m.hruba)}</td>
                        <td>{eur(m.cista)}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            style={{ width: 110 }}
                            value={d.received ?? (m.received ?? "")}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [m.month]: { ...prev[m.month], received: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ color: m.difference == null ? undefined : m.difference >= 0 ? "var(--green)" : "var(--red)" }}>
                          {eur(m.difference)}
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
            <div className="row" style={{ marginBottom: 16 }}>
              <select value={month.month} onChange={(e) => setSelectedMonth(e.target.value)}>
                {data.months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span>
                Received{" "}
                <input
                  type="number"
                  step="0.01"
                  value={(drafts[month.month]?.received ?? month.received) ?? ""}
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
            <div className="cards">
              <Kpi label="Hours" value={hrs(month.hours)} />
              <Kpi label="Hrubá mzda" value={eur(month.hruba)} tone="gold" />
              <Kpi label="Čistá mzda" value={eur(month.cista)} />
              <Kpi
                label="Difference"
                value={eur(month.difference)}
                tone={month.difference == null ? "" : month.difference >= 0 ? "green" : "red"}
              />
            </div>
            <div className="panel">
              <h3>Payslip</h3>
              <table>
                <tbody>
                  {[
                    ["Základná mzda", month.basic],
                    ["Príplatok sobota", month.sat_prem],
                    ["Príplatok nedeľa", month.sun_prem],
                    ["Práca v noci", month.night_prem],
                    ["Príplatok sviatok", month.holiday_prem],
                    ["Osobné ohodnotenie", month.osobne],
                    ["Hrubá mzda", month.hruba],
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
                      <td>{hrs(s.hours)}</td>
                      <td>{hrs(s.night_h)}</td>
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
              {Object.entries(settingsDraft).map(([key, value]) => (
                <FragmentRow
                  key={key}
                  name={key}
                  value={value}
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

function FragmentRow({ name, value, onChange }) {
  const isBool = typeof value === "boolean";
  const isNum = typeof value === "number";
  return (
    <>
      <label htmlFor={name}>{name.replaceAll("_", " ")}</label>
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
