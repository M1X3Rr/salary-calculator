from datetime import date, time

from payroll import compute_shift
from storage import DEFAULT_SETTINGS, settings_for_year, validate_state


def test_2026_settings_match_live_defaults():
    live = settings_for_year(DEFAULT_SETTINGS, 2026)
    assert live is DEFAULT_SETTINGS
    a = compute_shift(date(2026, 1, 5), time(8, 0), time(16, 0), DEFAULT_SETTINGS)
    b = compute_shift(date(2026, 1, 5), time(8, 0), time(16, 0), live)
    assert a.brutto == b.brutto
    assert a.hours == b.hours


def test_flat_state_migrates_to_profile():
    state = validate_state({"settings": {"name": "Ada"}, "shifts": []})
    assert set(state["profiles"]) == {"default"}
    assert state["profiles"]["default"]["settings"]["name"] == "Ada"


def test_switch_does_not_leak_shifts():
    payload = {
        "active_profile": "a",
        "profiles": {
            "a": {
                "settings": {"name": "A"},
                "shifts": [{"date": "2026-01-05", "start": "08:00", "end": "12:00"}],
            },
            "b": {"settings": {"name": "B"}, "shifts": []},
        },
    }
    state = validate_state(payload)
    assert len(state["profiles"]["a"]["shifts"]) == 1
    assert state["profiles"]["b"]["shifts"] == []
    state["active_profile"] = "b"
    assert state["profiles"]["a"]["shifts"][0]["date"] == "2026-01-05"
    assert state["profiles"]["b"]["shifts"] == []
