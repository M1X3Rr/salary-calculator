"""Slovak 2026 payroll for an hourly part-time employment contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from holidays import holiday_name

NIGHT_START = time(22, 0)
NIGHT_END = time(6, 0)


def _r2(value: float) -> float:
    return round(value + 1e-12, 2)


def overlap_hours(start: datetime, end: datetime, window_start: datetime, window_end: datetime) -> float:
    latest_start = max(start, window_start)
    earliest_end = min(end, window_end)
    seconds = (earliest_end - latest_start).total_seconds()
    return max(0.0, seconds / 3600.0)


def night_hours(start: datetime, end: datetime) -> float:
    """Overlap with 22:00–06:00, including overnight shifts."""
    total = 0.0
    day0 = datetime.combine(start.date() - timedelta(days=1), time(0, 0))
    for offset in range(4):
        d = day0 + timedelta(days=offset)
        w1 = datetime.combine(d.date(), NIGHT_START)
        w2 = datetime.combine(d.date() + timedelta(days=1), NIGHT_END)
        total += overlap_hours(start, end, w1, w2)
    return total


def split_by_calendar_day(start: datetime, end: datetime) -> list[tuple[date, float]]:
    chunks: list[tuple[date, float]] = []
    cursor = start
    while cursor < end:
        next_midnight = datetime.combine(cursor.date() + timedelta(days=1), time(0, 0))
        piece_end = min(end, next_midnight)
        hours = (piece_end - cursor).total_seconds() / 3600.0
        if hours > 1e-9:
            chunks.append((cursor.date(), hours))
        cursor = piece_end
    return chunks


@dataclass
class ShiftPay:
    work_date: str
    weekday: str
    start: str
    end: str
    hours: float
    night_h: float
    sat_h: float
    sun_h: float
    holiday_h: float
    holiday_name: str | None
    day_type: str
    basic: float
    sat_prem: float
    sun_prem: float
    night_prem: float
    holiday_prem: float
    ot_prem: float
    brutto: float

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def shift_datetimes(work_date: date, start_t: time, end_t: time) -> tuple[datetime, datetime]:
    start = datetime.combine(work_date, start_t)
    end = datetime.combine(work_date, end_t)
    if end <= start:
        end += timedelta(days=1)
    return start, end


def compute_shift(
    work_date: date,
    start_t: time,
    end_t: time,
    settings: dict[str, Any],
    reported_hours: float | None = None,
) -> ShiftPay:
    start, end = shift_datetimes(work_date, start_t, end_t)
    hours = (end - start).total_seconds() / 3600.0

    night = night_hours(start, end)
    sat = sun = hol = 0.0
    hol_names: list[str] = []
    for day, h in split_by_calendar_day(start, end):
        wd = day.isoweekday()
        if wd == 6:
            sat += h
        elif wd == 7:
            sun += h
        name = holiday_name(day)
        if name:
            hol += h
            if name not in hol_names:
                hol_names.append(name)

    rate = float(settings["hourly_rate"])
    avg = float(settings.get("avg_earnings") or 0) or rate
    basic = _r2(hours * rate)
    sat_prem = _r2(sat * float(settings["prem_sat"]))
    sun_prem = _r2(sun * float(settings["prem_sun"]))
    night_prem = _r2(night * float(settings["prem_night"]))
    holiday_prem = _r2(hol * avg * float(settings["prem_hol_pct"]))
    ot_prem = 0.0
    brutto = _r2(basic + sat_prem + sun_prem + night_prem + holiday_prem + ot_prem)

    if hol_names:
        day_type = "Holiday / Sviatok"
    elif work_date.isoweekday() == 6:
        day_type = "Saturday"
    elif work_date.isoweekday() == 7:
        day_type = "Sunday"
    else:
        day_type = "Weekday"

    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return ShiftPay(
        work_date=work_date.isoformat(),
        weekday=weekdays[work_date.weekday()],
        start=start_t.strftime("%H:%M"),
        end=end_t.strftime("%H:%M"),
        hours=_r2(hours),
        night_h=_r2(night),
        sat_h=_r2(sat),
        sun_h=_r2(sun),
        holiday_h=_r2(hol),
        holiday_name=hol_names[0] if hol_names else None,
        day_type=day_type,
        basic=basic,
        sat_prem=sat_prem,
        sun_prem=sun_prem,
        night_prem=night_prem,
        holiday_prem=holiday_prem,
        ot_prem=ot_prem,
        brutto=brutto,
    )


def month_payroll(shifts: list[ShiftPay], settings: dict[str, Any], osobne: float = 0.0) -> dict[str, Any]:
    hours = _r2(sum(s.hours for s in shifts))
    night_h = _r2(sum(s.night_h for s in shifts))
    sat_h = _r2(sum(s.sat_h for s in shifts))
    sun_h = _r2(sum(s.sun_h for s in shifts))
    holiday_h = _r2(sum(s.holiday_h for s in shifts))
    basic = _r2(sum(s.basic for s in shifts))
    sat_prem = _r2(sum(s.sat_prem for s in shifts))
    sun_prem = _r2(sum(s.sun_prem for s in shifts))
    night_prem = _r2(sum(s.night_prem for s in shifts))
    holiday_prem = _r2(sum(s.holiday_prem for s in shifts))
    hruba = _r2(sum(s.brutto for s in shifts) + float(osobne or 0))

    if hruba <= 0:
        empty = {
            "days": 0,
            "hours": 0.0,
            "night_h": 0.0,
            "sat_h": 0.0,
            "sun_h": 0.0,
            "holiday_h": 0.0,
            "basic": 0.0,
            "sat_prem": 0.0,
            "sun_prem": 0.0,
            "night_prem": 0.0,
            "holiday_prem": 0.0,
            "osobne": _r2(float(osobne or 0)),
            "hruba": 0.0,
            "np": 0.0,
            "sp": 0.0,
            "ip": 0.0,
            "pvn": 0.0,
            "zp": 0.0,
            "odvody": 0.0,
            "tax_base": 0.0,
            "nczd_applied": 0.0,
            "dan": 0.0,
            "cista": 0.0,
            "employer_cost": 0.0,
        }
        return empty

    np = _r2(hruba * float(settings["rate_np"]))
    sp = _r2(hruba * float(settings["rate_sp"]))
    ip = _r2(hruba * float(settings["rate_ip"]))
    pvn = _r2(hruba * float(settings["rate_pvn"]))
    zp = _r2(hruba * float(settings["rate_zp"]))
    odvody = _r2(np + sp + ip + pvn + zp)
    tax_base = _r2(hruba - odvody)
    nczd = float(settings["nczd"])
    apply = bool(settings.get("apply_nczd", True))
    nczd_applied = _r2(min(nczd, max(tax_base, 0.0))) if apply else 0.0
    taxable = max(0.0, tax_base - nczd_applied)
    bracket = float(settings["bracket19"])
    tax19 = float(settings["tax19"])
    tax25 = float(settings["tax25"])
    if taxable <= bracket:
        dan = _r2(taxable * tax19)
    else:
        dan = _r2(bracket * tax19 + (taxable - bracket) * tax25)
    cista = _r2(hruba - odvody - dan)

    er = (
        _r2(hruba * float(settings["er_np"]))
        + _r2(hruba * float(settings["er_sp"]))
        + _r2(hruba * float(settings["er_ip"]))
        + _r2(hruba * float(settings["er_pvn"]))
        + _r2(hruba * float(settings["er_pfp"]))
        + _r2(hruba * float(settings["er_up"]))
        + _r2(hruba * float(settings["er_gp"]))
        + _r2(hruba * float(settings["er_prfs"]))
        + _r2(hruba * float(settings["er_zp"]))
    )
    return {
        "days": len(shifts),
        "hours": hours,
        "night_h": night_h,
        "sat_h": sat_h,
        "sun_h": sun_h,
        "holiday_h": holiday_h,
        "basic": basic,
        "sat_prem": sat_prem,
        "sun_prem": sun_prem,
        "night_prem": night_prem,
        "holiday_prem": holiday_prem,
        "osobne": _r2(float(osobne or 0)),
        "hruba": hruba,
        "np": np,
        "sp": sp,
        "ip": ip,
        "pvn": pvn,
        "zp": zp,
        "odvody": odvody,
        "tax_base": tax_base,
        "nczd_applied": nczd_applied,
        "dan": dan,
        "cista": cista,
        "employer_cost": _r2(hruba + er),
    }
