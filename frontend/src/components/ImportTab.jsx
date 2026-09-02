import { useState } from "react";
import { api, hours } from "../api.js";

function formatImportShift(shift) {
  const range = `${shift.start}–${shift.end}`;
  if (shift.reported_hours == null || shift.reported_hours === "") return range;
  return `${range} · ${hours(shift.reported_hours)}`;
}

export function ImportConflictModal({ preview, onCancel, onApply }) {
  const conflicts = preview.conflicts || [];
  const [choice, setChoice] = useState(() => Object.fromEntries(conflicts.map((c) => [c.date, "leave"])));
  const overwriteCount = Object.values(choice).filter((v) => v === "overwrite").length;
  const leaveCount = conflicts.length - overwriteCount;
  return (
    <div className="modal-back" role="presentation">
      <div className="modal stub-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import conflicts">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Stored days differ from this file</h3>
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <p className="sub">
          {preview.filename ? `${preview.filename} · ` : ""}
          {preview.new_count || 0} new day{(preview.new_count || 0) === 1 ? "" : "s"}
          {preview.same_count ? ` · ${preview.same_count} already match` : ""}. For the days below, leave the stored
          hours or overwrite with the file.
        </p>
        <div className="row">
          <button
            type="button"
            className="ghost"
            onClick={() => setChoice(Object.fromEntries(conflicts.map((c) => [c.date, "leave"])))}
          >
            Leave all stored
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setChoice(Object.fromEntries(conflicts.map((c) => [c.date, "overwrite"])))}
          >
            Overwrite all
          </button>
        </div>
        <table className="conflict-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Stored</th>
              <th>In this file</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((row) => (
              <tr key={row.date} className={choice[row.date] === "overwrite" ? "conflict-overwrite" : "conflict-leave"}>
                <td>{row.date}</td>
                <td>{(row.existing || []).map(formatImportShift).join("; ") || "—"}</td>
                <td>{(row.incoming || []).map(formatImportShift).join("; ") || "—"}</td>
                <td>
                  <div className="mode-switch" role="group" aria-label={`Keep or overwrite ${row.date}`}>
                    <button
                      type="button"
                      className={choice[row.date] === "leave" ? "active" : ""}
                      onClick={() => setChoice((prev) => ({ ...prev, [row.date]: "leave" }))}
                    >
                      Leave
                    </button>
                    <button
                      type="button"
                      className={choice[row.date] === "overwrite" ? "active" : ""}
                      onClick={() => setChoice((prev) => ({ ...prev, [row.date]: "overwrite" }))}
                    >
                      Overwrite
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onApply(Object.entries(choice).filter(([, v]) => v === "overwrite").map(([date]) => date))
            }
          >
            Apply ({leaveCount} leave, {overwriteCount} overwrite)
          </button>
        </p>
      </div>
    </div>
  );
}

export function ImportTab({ data, onImport, finishImport, setError, setStatus }) {
  return (
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
        <input type="file" accept=".xls,.html,.htm" onChange={(e) => onImport(e.target.files[0])} />
      </div>
      <p className="sub">
        New days are added. Days that already match are left alone. If a stored day differs from the file, you choose
        leave or overwrite.
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="ghost"
          disabled={!data.can_undo_import}
          onClick={async () => {
            setError("");
            try {
              finishImport(await api.undoImport());
              setStatus("Last import undone.");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Undo last import
        </button>
        <button
          type="button"
          className="ghost"
          onClick={async () => {
            setError("");
            try {
              await api.downloadBackup();
              setStatus("Downloaded salary-state.json.");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Download backup
        </button>
        <label className="ghost" style={{ cursor: "pointer", padding: "8px 12px" }}>
          Restore backup
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!window.confirm("Replace all local payroll data with this backup?")) return;
              setError("");
              try {
                finishImport(await api.restoreBackup(file));
                setStatus("Backup restored.");
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        </label>
      </div>
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
  );
}
