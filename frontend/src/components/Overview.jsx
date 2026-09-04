import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { hours } from "../api.js";
import { eur, parseReceived, receivedAmountLabel } from "../format.js";
import { downloadYearCsv, downloadYearReport, printYearReport } from "../report.js";
import { isStubIncomplete } from "../stub.js";
import { HoursNeededBar, HoursSparkline, Kpi, ModeSwitch, StubOpenButton } from "./widgets.jsx";

export function Overview({
  data,
  year,
  setYear,
  months,
  drafts,
  setDrafts,
  totals,
  mode,
  partTime,
  shiftLabel,
  whatIf,
  setWhatIf,
  applyWhatIf,
  saveMode,
  saveMonth,
  openStubFor,
  setSelectedMonth,
  setTab,
  setStatus,
  profile,
  light,
  chartMuted,
  chartGrid,
}) {
  return (
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
                ? `4 h × weekdays (20 h/week) · extra hours are osobné`
                : `${totals.workingDays} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
            });
            setStatus(`Downloaded overview report for ${year}.`);
          }}
        >
          Download year report
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
            downloadYearCsv({ year, months: reportMonths });
            setStatus(`Downloaded overview CSV for ${year}.`);
          }}
        >
          Download CSV
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
            printYearReport({
              year,
              profile,
              mode,
              months: reportMonths,
              totals,
              hoursLabel: partTime
                ? `4 h × weekdays (20 h/week) · extra hours are osobné`
                : `${totals.workingDays} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
            });
          }}
        >
          Print / save PDF
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
          extraHint={partTime ? "Hours above 20 h/week are osobné ohodnotenie" : ""}
          label={
            partTime
              ? `4 h × weekdays (20 h/week) · extra hours are osobné`
              : `${totals.workingDays} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`
          }
        />
      )}
      {months.length > 0 && <HoursSparkline months={months} partTime={partTime} />}
      <div className="panel" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={months.map((m) => ({
              ...m,
              difference: m.received == null ? null : m.received - m.cista,
            }))}
          >
            <CartesianGrid stroke={chartGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: chartMuted, fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: chartMuted, fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: chartMuted, fontSize: 11 }} />
            <Tooltip formatter={(v) => eur(v)} />
            <Legend />
            <Bar yAxisId="left" dataKey="hruba" name="Brutto" fill="#c4a35a" />
            <Bar yAxisId="left" dataKey="cista" name="Calculated netto" fill="#3dcf8e" />
            <Bar yAxisId="left" dataKey="received" name="Received">
              {months.map((m) => (
                <Cell
                  key={m.month}
                  fill={
                    m.received == null
                      ? "#6ea8fe"
                      : m.received >= m.cista
                        ? light
                          ? "#1b7a4e"
                          : "#3dcf8e"
                        : light
                          ? "#a33b2b"
                          : "#ef6b6b"
                  }
                />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="difference"
              name="Difference"
              stroke="#e67e22"
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="panel overview-table">
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
                    <button
                      className="ghost"
                      onClick={() => {
                        setSelectedMonth(m.month);
                        setTab("month");
                      }}
                    >
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
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        style={{ width: 110 }}
                        value={d.received ?? (m.received || "")}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [m.month]: { ...prev[m.month], received: e.target.value },
                          }))
                        }
                        onBlur={(e) => saveMonth(m, { received: e.target.value })}
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
                  <td
                    style={{
                      color: difference == null ? undefined : difference >= 0 ? "var(--green)" : "var(--red)",
                    }}
                  >
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
                      onBlur={(e) => saveMonth(m, { note: e.target.value })}
                    />
                  </td>
                  <td></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
