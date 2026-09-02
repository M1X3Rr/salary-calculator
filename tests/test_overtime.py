from types import SimpleNamespace

from payroll import overtime_hours_for_month, weeks_for_month

PART_TIME = {"employment_type": "part_time", "contract_h_week": 20}
FULL_TIME = {"employment_type": "full_time", "full_time_shift_hours": 8, "contract_h_week": 20}


def _hours(iso, hours):
    return SimpleNamespace(work_date=iso, hours=hours)


def test_full_week_over_20h_is_ot():
    # 5–11 Jan 2026 is a complete Mon–Sun week inside January.
    shifts = [_hours("2026-01-05", 22.0)]
    weeks = weeks_for_month(2026, 1, shifts, PART_TIME)
    full = next(w for w in weeks if w["start"] == "2026-01-05")
    assert full["complete"] is True
    assert full["hours"] == 22.0
    assert full["needed"] == 20.0
    assert full["overtime"] == 2.0
    assert overtime_hours_for_month(2026, 1, 22.0, PART_TIME, weeks=weeks) == 2.0


def test_partial_week_over_cap_has_no_ot():
    # 1–4 Jan 2026 is Thu–Sun (4 days). 15 h is over the prorated bar, not paid OT.
    shifts = [_hours("2026-01-01", 15.0)]
    weeks = weeks_for_month(2026, 1, shifts, PART_TIME)
    partial = next(w for w in weeks if w["start"] == "2026-01-01")
    assert partial["complete"] is False
    assert partial["days"] == 4
    assert partial["hours"] == 15.0
    assert partial["needed"] == round(20 * 4 / 7 + 1e-12, 4)
    assert 15.0 > partial["needed"]
    assert partial["overtime"] == 0.0
    assert overtime_hours_for_month(2026, 1, 15.0, PART_TIME, weeks=weeks) == 0.0


def test_full_time_has_no_ot():
    shifts = [_hours("2026-01-05", 22.0)]
    weeks = weeks_for_month(2026, 1, shifts, FULL_TIME)
    full = next(w for w in weeks if w["start"] == "2026-01-05")
    assert full["overtime"] == 0.0
    assert overtime_hours_for_month(2026, 1, 22.0, FULL_TIME, weeks=weeks) == 0.0
    assert overtime_hours_for_month(2026, 1, 22.0, FULL_TIME) == 0.0
