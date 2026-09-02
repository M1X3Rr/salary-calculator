import { hours, modeSubtitle } from "../api.js";

export function Kpi({ label, value, tone, keepCase }) {
  return (
    <div className="card">
      <div className={`k${keepCase ? " keep-case" : ""}`}>{label}</div>
      <div className={`v ${tone || ""}`}>{value}</div>
    </div>
  );
}

export function HoursNeededBar({ worked, needed, label, extraHint }) {
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

export function HoursSparkline({ months, partTime }) {
  return (
    <div className="panel hours-spark">
      <h3>{partTime ? "Hours vs 20 h/week" : "Hours vs monthly target"}</h3>
      <div className="spark-row">
        {months.map((m) => {
          const needed = Number(m.needed_hours) || 0;
          const worked = Number(m.hours) || 0;
          const pct = needed > 0 ? Math.min(100, (worked / needed) * 100) : 0;
          const met = needed > 0 && worked + 1 / 60 >= needed;
          return (
            <div
              key={m.month}
              className="spark-col"
              title={`${m.label}: ${hours(worked)} / ${hours(needed)}`}
            >
              <div className="spark-track">
                <div className={`spark-fill${met ? " met" : ""}`} style={{ height: `${pct}%` }} />
              </div>
              <span>{m.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ThemeSwitch({ theme, onChange }) {
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

export function ModeSwitch({ mode, onChange }) {
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

export function StubOpenButton({ onClick, label, warn = false }) {
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
