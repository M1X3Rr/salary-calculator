import { Fragment } from "react";
import { calendarCells, hours, isOvernight } from "../api.js";
import { eur, receivedAmountLabel } from "../format.js";
import { downloadMonthCsv, downloadMonthReport, payslipLines, printMonthReport } from "../report.js";
import { HoursNeededBar, Kpi, ModeSwitch, StubOpenButton } from "./widgets.jsx";

function shiftChips(shift, weekOt) {
  if (!shift) return [];
  const chips = [];
  if (Number(shift.night_h) > 0.05) chips.push({ k: "night", t: "Night" });
  if (Number(shift.sat_h) > 0.05) chips.push({ k: "sat", t: "Sat" });
  if (Number(shift.sun_h) > 0.05) chips.push({ k: "sun", t: "Sun" });
  if (Number(shift.holiday_h) > 0.05 || shift.holiday_name) chips.push({ k: "hol", t: "Sviatok" });
  if (weekOt) chips.push({ k: "ot", t: "OT" });
  return chips;
}

export function weeksOfMonth(month) {
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
  const label = w.complete
    ? `Week ${idx + 1} · ${w.start} – ${w.end}`
    : `Week ${idx + 1} · ${w.start} – ${w.end} · ${w.days || "?"} days in month`;
  const worked = shifts.reduce((n, s) => n + Number(s.hours || 0), 0);
  const needed = Number(w.needed) || 0;
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
        needed={needed}
        extraHint={partTime ? "hours above cap → osobné" : ""}
        label={
          partTime
            ? w.complete
              ? "20 h/week contract"
              : `Prorated 20 h/week (${hours(needed)} target)`
            : "Weekly target"
        }
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
              <th>Clock</th>
              <th>Break</th>
              <th>Billed</th>
              <th>Type</th>
              <th>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={9}>No shifts this week.</td>
              </tr>
            ) : (
              shifts.map((s) => (
                <tr key={`${s.work_date}-${s.start}`}>
                  <td>{s.work_date}</td>
                  <td>{s.weekday}</td>
                  <td>{s.start}</td>
                  <td>{s.end}</td>
                  <td>{hours(s.clock_hours)}</td>
                  <td>{hours(s.break_hours)}</td>
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

function MonthCalendar({
  month,
  weeks = [],
  weekIndex = -1,
  partTime,
  selectedIso,
  noteDraft,
  onSelect,
  onAddShift,
  onEditShift,
  onDeleteShift,
  onOpenWeek,
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
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    while (row.length < 7) row.push(null);
    rows.push(row);
  }

  return (
    <div className="panel">
      <h3>Workdays</h3>
      <p className="vac-summary">Click a week number for hours vs 20 h. Select a day to edit its shift.</p>
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
        <span className="cal-week-label">Wk</span>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-grid">
        {rows.map((row, wi) => (
          <Fragment key={`w-${wi}`}>
            <button
              type="button"
              className={`cal-week-num${weekIndex === wi ? " active" : ""}`}
              title={`Week ${wi + 1} vs 20 h`}
              aria-label={`Open week ${wi + 1}`}
              onClick={() => onOpenWeek?.(wi)}
            >
              {wi + 1}
              <span className="cal-week-tick" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, weeks[wi]?.needed ? ((weeks[wi].hours || 0) / weeks[wi].needed) * 100 : 0)}%`,
                  }}
                />
              </span>
            </button>
            {row.map((cell, ci) => {
              if (!cell) return <div key={`e-${wi}-${ci}`} className="cal-cell empty-cell" />;
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
                      <span className="chip-row">
                        {shiftChips(shift, Boolean(weeks[wi]?.overtime)).map((c) => (
                          <span key={c.k} className={`prem-chip ${c.k}`}>
                            {c.t}
                          </span>
                        ))}
                      </span>
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
          </Fragment>
        ))}
      </div>
      {selected && (
        <div className="day-detail">
          <h4>
            {selected.iso}
            {selected.shift ? ` · ${selected.shift.weekday}` : ""}
          </h4>
          {selected.shift ? (
            <>
              <p>
                {selected.shift.start}–{selected.shift.end}
                {" · billed "}
                {hours(selected.shift.hours)}
                {" · clock "}
                {hours(selected.shift.clock_hours)}
                {" · break "}
                {hours(selected.shift.break_hours)}
              </p>
              <p>
                Night {hours(selected.shift.night_h)}
                {" · "}
                {selected.shift.holiday_name || selected.shift.day_type}
                {" · "}
                {eur(selected.shift.brutto)}
              </p>
              <div className="row">
                <button type="button" className="ghost" onClick={() => onEditShift?.(selected.shift)}>
                  Edit
                </button>
                <button type="button" className="ghost" onClick={() => onDeleteShift?.(selected.shift)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="ghost" onClick={() => onAddShift?.(selected.iso)}>
              + Add shift
            </button>
          )}
        </div>
      )}
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
            placeholder="Why you were off, or why you were called in… Ctrl+Enter to save"
          />
          <button type="button" className="primary" onClick={onSaveNote}>
            Save note
          </button>
        </div>
      )}
    </div>
  );
}

export function MonthView({
  data,
  month,
  monthReceived,
  monthDiff,
  monthIncomplete,
  monthWeeks,
  drafts,
  setDrafts,
  mode,
  partTime,
  shiftLabel,
  profile,
  saveMode,
  saveMonth,
  saveShift,
  saveVacation,
  goMonth,
  prevMonth,
  nextMonth,
  weekView,
  setWeekView,
  weekIndex,
  setWeekIndex,
  selectedDay,
  setSelectedDay,
  noteDraft,
  setNoteDraft,
  setStubOpen,
  setShiftModal,
  setStatus,
}) {
  return (
    <>
      <div className="month-toolbar">
        <div className="row">
          <select value={month.month} onChange={(e) => goMonth(e.target.value)}>
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
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={(drafts[month.month]?.received ?? month.received) || ""}
              onChange={(e) =>
                setDrafts((prev) => ({
                  ...prev,
                  [month.month]: { ...prev[month.month], received: e.target.value },
                }))
              }
              onBlur={(e) => saveMonth(month, { received: e.target.value })}
            />
            <StubOpenButton
              warn={monthIncomplete}
              onClick={() => setStubOpen(true)}
              label={monthIncomplete ? "Not all payslip details were added" : "Payslip stub details"}
            />
          </span>
          {weekView && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setWeekView(false);
                setWeekIndex(0);
              }}
            >
              Back to month
            </button>
          )}
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
                ? `${month.working_days ?? 0} weekdays · 4 h/day základná (hours above that are osobné)`
                  : `${month.working_days ?? 0} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
              });
              setStatus(`Downloaded payslip for ${month.label}.`);
            }}
          >
            Download payslip
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              downloadMonthCsv({ month, partTime });
              setStatus(`Downloaded payslip CSV for ${month.label}.`);
            }}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              printMonthReport({
                month,
                profile,
                mode,
                partTime,
                received: monthReceived,
                difference: monthDiff,
                hoursLabel: partTime
                ? `${month.working_days ?? 0} weekdays · 4 h/day základná (hours above that are osobné)`
                  : `${month.working_days ?? 0} working days × ${shiftLabel} h (weekends, sviatky & vacation excluded)`,
              });
            }}
          >
            Print / save PDF
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
                    <StubOpenButton onClick={() => setStubOpen(true)} label="Payslip stub details" />
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
            extraHint={partTime ? "Hours above 20 h/week are osobné ohodnotenie" : ""}
            label={
              partTime
                ? `4 h × weekdays (20 h/week) · extra hours are osobné`
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
              weeks={monthWeeks}
              weekIndex={weekView ? weekIndex : -1}
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
              onDeleteShift={(shift) => {
                if (!window.confirm(`Delete shift ${shift.work_date} ${shift.start}–${shift.end}?`)) return;
                saveShift({
                  delete: true,
                  old_date: shift.work_date,
                  old_start: shift.start,
                  old_end: shift.end,
                });
              }}
              onOpenWeek={(idx) => {
                setWeekIndex(idx);
                setWeekView(true);
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
        </>
      )}
    </>
  );
}
