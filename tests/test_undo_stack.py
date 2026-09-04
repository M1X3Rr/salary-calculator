from app import _commit_import, import_undo
from storage import UNDO_LIMIT, active_profile, default_state, load_state, save_state


def _pending(day, start="08:00"):
    shift = {"date": day, "start": start, "end": "16:00", "reported_hours": None}
    return {
        "filename": f"{day}.xls",
        "employee": "Test",
        "department": "HQ",
        "shifts": [shift],
        "new_dates": [day],
        "same_dates": [],
        "conflicts": [],
    }


def _patch(monkeypatch, tmp_path):
    monkeypatch.setattr("storage.STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr("storage.DATA_DIR", tmp_path)
    save_state(default_state())


def test_two_imports_two_undos(monkeypatch, tmp_path):
    _patch(monkeypatch, tmp_path)
    first = _commit_import(load_state(), _pending("2026-01-05"), set())
    assert first["shift_count"] == 1
    second = _commit_import(load_state(), _pending("2026-01-06"), set())
    assert second["shift_count"] == 2
    assert second["undo_count"] == 2

    undone = import_undo()
    assert undone["shift_count"] == 1
    dates = {s["work_date"] for m in undone["months"] for s in m["shifts"]}
    assert dates == {"2026-01-05"}

    undone2 = import_undo()
    assert undone2["shift_count"] == 0


def test_sixth_import_drops_oldest(monkeypatch, tmp_path):
    _patch(monkeypatch, tmp_path)
    for i in range(6):
        _commit_import(load_state(), _pending(f"2026-01-{i + 1:02d}"), set())
    bag = active_profile(load_state())
    assert len(bag["import_undos"]) == UNDO_LIMIT
