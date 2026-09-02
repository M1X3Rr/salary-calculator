export function ShiftModal({ draft, onChange, onClose, onSave }) {
  const editing = Boolean(draft.old_date);
  const reported =
    draft.reported_hours === "" || draft.reported_hours == null ? null : Number(draft.reported_hours);
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit shift">
        <h3>{editing ? "Edit shift" : "Add shift"}</h3>
        <label>
          Date
          <input type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} />
        </label>
        <label>
          Start
          <input type="time" value={draft.start} onChange={(e) => onChange({ ...draft, start: e.target.value })} />
        </label>
        <label>
          End
          <input type="time" value={draft.end} onChange={(e) => onChange({ ...draft, end: e.target.value })} />
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
