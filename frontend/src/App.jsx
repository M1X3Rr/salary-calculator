import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ImportConflictModal, ImportTab } from "./components/ImportTab.jsx";
import { MonthView, weeksOfMonth } from "./components/MonthView.jsx";
import { Overview } from "./components/Overview.jsx";
import { SettingsTab } from "./components/SettingsTab.jsx";
import { ShiftModal } from "./components/ShiftModal.jsx";
import { StubModal } from "./components/StubModal.jsx";
import { ThemeSwitch } from "./components/widgets.jsx";
import { loadTheme, parseReceived } from "./format.js";
import { fillStubFromCalc, isStubIncomplete, parseStub, stubFromMonth } from "./stub.js";

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
  const [importPreview, setImportPreview] = useState(null);

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
    const today = new Date().toISOString().slice(0, 7);
    const hasToday = (report.months || []).some((m) => m.month === today);
    setYear((y) => y || (hasToday ? today.slice(0, 4) : years[years.length - 1] || ""));
    if (report.months?.length && !selectedMonth) {
      setSelectedMonth(hasToday ? today : report.months[report.months.length - 1].month);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fetch only
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
  const unsavedKeys = Object.keys(drafts).filter((k) => {
    const d = drafts[k];
    return d && ("received" in d || "note" in d || d.stub || d.osobne != null);
  });

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

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (e.key === "Escape") {
        if (stubOpen) {
          setStubOpen(false);
          e.preventDefault();
          return;
        }
        if (shiftModal) {
          setShiftModal(null);
          e.preventDefault();
          return;
        }
        if (importPreview) {
          api.cancelImport().catch(() => {});
          setImportPreview(null);
          setStatus("Import cancelled. Stored hours were not changed.");
          e.preventDefault();
        }
        return;
      }
      if (el?.id === "vac-note" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.querySelector(".note-box .primary")?.click();
        return;
      }
      if (typing) return;
      if (tab !== "month") return;
      if (e.key === "[" && prevMonth) goMonth(prevMonth.month);
      if (e.key === "]" && nextMonth) goMonth(nextMonth.month);
      if (e.key === "w" || e.key === "W") {
        setWeekView((open) => {
          if (open) return false;
          setWeekIndex(0);
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, prevMonth, nextMonth, stubOpen, shiftModal, importPreview]);

  const finishImport = (report) => {
    applyReport(report);
    const years = report.years || [];
    setYear(years[years.length - 1] || "");
    if (report.months?.length) setSelectedMonth(report.months[report.months.length - 1].month);
    setImportPreview(null);
    const meta = report.import_meta || {};
    const bits = [];
    if (meta.added) bits.push(`${meta.added} new`);
    if (meta.unchanged) bits.push(`${meta.unchanged} unchanged`);
    if (meta.replaced) bits.push(`${meta.replaced} overwritten`);
    if (meta.kept) bits.push(`${meta.kept} kept as stored`);
    setStatus(
      `Imported ${meta.employee || "hours"}${bits.length ? ` · ${bits.join(", ")}` : ` · ${report.shift_count} shifts`}.`
    );
  };

  const onImport = async (file) => {
    if (!file) return;
    setError("");
    setStatus("Importing…");
    try {
      const report = await api.importFile(file);
      if (report.preview) {
        setImportPreview(report);
        setStatus(
          `${report.conflicts.length} stored day${report.conflicts.length === 1 ? "" : "s"} differ from this file. Choose leave or overwrite.`
        );
        return;
      }
      finishImport(report);
    } catch (e) {
      setError(e.message);
      setStatus("");
    }
  };

  const resolveImport = async (overwrite) => {
    setError("");
    try {
      const report = await api.resolveImport(overwrite);
      finishImport(report);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMonth = async (m, patch = {}) => {
    const draft = { ...(drafts[m.month] || {}), ...patch };
    setError("");
    try {
      const payload = {
        month: m.month,
        received: parseReceived(
          Object.prototype.hasOwnProperty.call(draft, "received") ? draft.received : m.received
        ),
        note: draft.note ?? m.note ?? "",
        osobne: draft.osobne === "" || draft.osobne == null ? m.osobne : Number(draft.osobne),
      };
      if (draft.stub) payload.stub = parseStub(draft.stub);
      await api.saveReceived(payload);
      await refreshCalc();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[m.month];
        return next;
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
        <div className="profile-switch">
          <label>
            Profile
            <select
              value={data.active_profile || "default"}
              onChange={async (e) => {
                setError("");
                try {
                  applyReport(await api.switchProfile(e.target.value));
                  setDrafts({});
                  setSelectedDay(null);
                  setStatus("Switched profile.");
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              {(data.profiles || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const name = window.prompt("Name for the new profile?");
              if (!name?.trim()) return;
              setError("");
              try {
                applyReport(await api.createProfile(name.trim()));
                setDrafts({});
                setStatus("Profile created.");
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            New profile
          </button>
        </div>
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
        {(error || status || unsavedKeys.length > 0) && (
          <div className="toast-stack" role="status">
            {error && <p className="err">{error}</p>}
            {!error && unsavedKeys.length > 0 && (
              <p className="preview-banner">
                {unsavedKeys.length} unsaved month{unsavedKeys.length === 1 ? "" : "s"}.
                <button
                  type="button"
                  className="primary"
                  onClick={async () => {
                    for (const key of unsavedKeys) {
                      const hit = (data.months || []).find((x) => x.month === key);
                      if (hit) await saveMonth(hit);
                    }
                  }}
                >
                  Save all
                </button>
              </p>
            )}
            {!error && unsavedKeys.length === 0 && status && <p className="msg">{status}</p>}
          </div>
        )}
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
          <Overview
            data={data}
            year={year}
            setYear={setYear}
            months={months}
            drafts={drafts}
            setDrafts={setDrafts}
            totals={totals}
            mode={mode}
            partTime={partTime}
            shiftLabel={shiftLabel}
            whatIf={whatIf}
            setWhatIf={setWhatIf}
            applyWhatIf={applyWhatIf}
            saveMode={saveMode}
            saveMonth={saveMonth}
            openStubFor={openStubFor}
            setSelectedMonth={setSelectedMonth}
            setTab={setTab}
            setStatus={setStatus}
            profile={profile}
            light={light}
            chartMuted={chartMuted}
            chartGrid={chartGrid}
          />
        )}

        {tab === "month" && month && (
          <>
            <MonthView
              data={data}
              month={month}
              monthReceived={monthReceived}
              monthDiff={monthDiff}
              monthIncomplete={monthIncomplete}
              monthWeeks={monthWeeks}
              drafts={drafts}
              setDrafts={setDrafts}
              mode={mode}
              partTime={partTime}
              shiftLabel={shiftLabel}
              profile={profile}
              saveMode={saveMode}
              saveMonth={saveMonth}
              saveShift={saveShift}
              saveVacation={saveVacation}
              goMonth={goMonth}
              prevMonth={prevMonth}
              nextMonth={nextMonth}
              weekView={weekView}
              setWeekView={setWeekView}
              weekIndex={weekIndex}
              setWeekIndex={setWeekIndex}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              setStubOpen={setStubOpen}
              setShiftModal={setShiftModal}
              setStatus={setStatus}
            />
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
                onCopyReceived={() => {
                  const raw = monthStubDraft.vyuctovanie || monthStubDraft.cista;
                  if (parseReceived(raw) == null) return;
                  setDrafts((prev) => ({
                    ...prev,
                    [month.month]: { ...prev[month.month], received: String(raw) },
                  }));
                }}
                onFillFromCalc={() => {
                  const filled = fillStubFromCalc(monthStubDraft, month);
                  setDrafts((prev) => ({
                    ...prev,
                    [month.month]: { ...prev[month.month], stub: filled },
                  }));
                }}
                onSave={(opts) => {
                  const patch = { stub: monthStubDraft };
                  const stubOsobne = parseReceived(monthStubDraft.osobne);
                  if (stubOsobne != null) patch.osobne = stubOsobne;
                  if (
                    parseReceived(monthStubDraft.vyuctovanie || monthStubDraft.cista) != null &&
                    opts?.copyReceived
                  ) {
                    patch.received = String(monthStubDraft.vyuctovanie || monthStubDraft.cista);
                  }
                  saveMonth(month, patch);
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
        {importPreview && (
          <ImportConflictModal
            preview={importPreview}
            onCancel={async () => {
              try {
                await api.cancelImport();
              } catch {
                /* still close */
              }
              setImportPreview(null);
              setStatus("Import cancelled. Stored hours were not changed.");
            }}
            onApply={resolveImport}
          />
        )}

        {tab === "import" && (
          <ImportTab
            data={data}
            onImport={onImport}
            finishImport={finishImport}
            setError={setError}
            setStatus={setStatus}
          />
        )}

        {tab === "settings" && settingsDraft && (
          <SettingsTab
            settingsDraft={settingsDraft}
            setSettingsDraft={setSettingsDraft}
            saveSettings={saveSettings}
          />
        )}
      </main>
    </div>
  );
}
