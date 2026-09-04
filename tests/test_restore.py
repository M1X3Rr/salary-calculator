import pytest

from storage import StateError, validate_state


def _ok_shift():
    return {"date": "2026-01-05", "start": "08:00", "end": "16:00"}


def test_valid_flat_backup_round_trip():
    payload = {
        "settings": {"hourly_rate": 9},
        "shifts": [_ok_shift()],
        "received": {"2026-01": {"amount": 100, "note": "ok"}},
        "vacation": {"2026-01": {"dates": ["2026-01-06"], "notes": {"2026-01-06": "off"}}},
        "import_undo": {"shifts": [], "imports": []},
    }
    state = validate_state(payload)
    assert state["active_profile"] == "default"
    bag = state["profiles"]["default"]
    assert bag["settings"]["hourly_rate"] == 9
    assert bag["shifts"] == [_ok_shift()]
    assert len(bag["import_undos"]) == 1


def test_missing_settings_raises():
    with pytest.raises(StateError, match="settings"):
        validate_state({"shifts": []})


def test_shifts_must_be_list():
    with pytest.raises(StateError, match="shifts"):
        validate_state({"settings": {}, "shifts": {"date": "2026-01-01"}})


def test_bad_shift_date_raises():
    with pytest.raises(StateError, match="Invalid shift date"):
        validate_state({"settings": {}, "shifts": [{"date": "2026-13-40", "start": "08:00", "end": "16:00"}]})
