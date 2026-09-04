from types import SimpleNamespace

from payroll import month_payroll, needed_hours_for_month
from storage import DEFAULT_SETTINGS


def _shift(hours: float) -> SimpleNamespace:
    rate = 8.0
    pay = round(hours * rate, 2)
    return SimpleNamespace(
        hours=hours,
        night_h=0.0,
        sat_h=0.0,
        sun_h=0.0,
        holiday_h=0.0,
        basic=pay,
        sat_prem=0.0,
        sun_prem=0.0,
        night_prem=0.0,
        holiday_prem=0.0,
        brutto=pay,
        clock_hours=hours,
        break_hours=0.0,
    )


def test_august_2026_cap_is_84_hours():
    weekdays, needed = needed_hours_for_month(2026, 8, DEFAULT_SETTINGS)
    assert weekdays == 21
    assert needed == 84.0


def test_student_extra_hours_are_osobne_not_ot_prplatok():
    settings = {**DEFAULT_SETTINGS, "hourly_rate": 8.0, "employment_type": "part_time"}
    pay = month_payroll([_shift(90.0)], settings, year=2026, month=8)
    assert pay["basic"] == 672.0
    assert pay["osobne"] == 48.0
    assert pay["ot_prem"] == 0.0
    assert pay["hruba"] == 720.0


def test_stub_osobne_overrides_auto_extra_hours():
    settings = {**DEFAULT_SETTINGS, "hourly_rate": 8.0, "employment_type": "part_time"}
    pay = month_payroll([_shift(90.0)], settings, osobne=634.0, year=2026, month=8)
    assert pay["basic"] == 672.0
    assert pay["osobne"] == 634.0
    assert pay["ot_prem"] == 0.0
    assert pay["hruba"] == 1306.0
    assert pay["sp"] == 44.24
    assert pay["ip"] == 33.18
    assert pay["dan"] == 138.96
