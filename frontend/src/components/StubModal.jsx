import { useState } from "react";
import { eur, parseReceived } from "../format.js";
import { STUB_GROUPS } from "../stub.js";

function ReconcilePanel({ month }) {
  const [showAll, setShowAll] = useState(false);
  const rows = month?.reconcile?.rows || [];
  const extras = month?.reconcile?.extras || [];
  const notes = month?.explainer || [];
  const meaningful = rows.filter((row) => row.delta != null && Math.abs(row.delta) >= 0.05);
  const visible = showAll ? rows : meaningful;
  const unexplained = month?.reconcile?.unexplained;
  const netDelta = month?.reconcile?.net_delta;
  if (!rows.length && !notes.length) return null;
  return (
    <div className="panel">
      <h3>Calc vs stub</h3>
      {(unexplained != null || netDelta != null) && (
        <p className="need-bar-meta">
          {unexplained != null && (
            <>
              Unexplained gap (stub čistá/vyúčtovanie − calc):{" "}
              <strong className={unexplained >= 0 ? "delta-pos" : "delta-neg"}>{eur(unexplained)}</strong>
            </>
          )}
          {unexplained != null && netDelta != null ? " · " : ""}
          {netDelta != null && (
            <>
              Sum of line deltas:{" "}
              <strong className={netDelta >= 0 ? "delta-pos" : "delta-neg"}>{eur(netDelta)}</strong>
            </>
          )}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="explainer">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="sub">
        {showAll ? `${rows.length} lines.` : `${meaningful.length} differences ≥ 0.05 €.`}{" "}
        <button type="button" className="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Hide matching lines" : "Show all lines"}
        </button>
      </p>
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
          {visible.length === 0 && extras.length === 0 ? (
            <tr>
              <td colSpan={4}>No material differences.</td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{eur(row.calc)}</td>
                <td>{eur(row.stub)}</td>
                <td className={row.delta == null ? "" : row.delta >= 0 ? "delta-pos" : "delta-neg"}>
                  {eur(row.delta)}
                </td>
              </tr>
            ))
          )}
          {extras.map((row) => (
            <tr key={row.label}>
              <td>
                {row.label}
                {row.qty != null ? ` (${row.qty})` : ""}
              </td>
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

export function StubModal({ month, stub, onChange, onCopyReceived, onFillFromCalc, onSave, onClose }) {
  const copyable = parseReceived(stub?.vyuctovanie || stub?.cista) != null;
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
          Paper stub for comparison. Saving copies filled <strong>osobné ohodnotenie</strong> into the calculation
          (otherwise extra hours above 20 h/week × hourly rate).
        </p>
        <div className="row">
          <button type="button" className="ghost" disabled={!copyable} onClick={onCopyReceived}>
            Copy čistá / vyúčtovanie into Received
          </button>
          <button type="button" className="ghost" onClick={onFillFromCalc}>
            Fill empty fields from calc
          </button>
        </div>
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
