import { SETTING_HINTS } from "../api.js";
import { settingsGroups } from "../stub.js";

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
        <input id={name} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
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

export function SettingsTab({ settingsDraft, setSettingsDraft, saveSettings }) {
  return (
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
  );
}
