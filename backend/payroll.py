"""Slovak 2026 payroll for an hourly part-time employment contract."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
import calendar

from holidays import holiday_name

NIGHT_START = time(22, 0)
NIGHT_END = time(6, 0)


def _r2(value: float) -> float:
    return round(value + 1e-12, 2)


def _r4(value: float) -> float:
    return round(value + 1e-12, 4)


def weekdays_in_month(year: int, month: int, skip_dates: set[date] | None = None) -> int:
    skip = skip_dates or set()
    last = calendar.monthrange(year, month)[1]
    count = 0
    for day in range(1, last + 1):
        d = date(year, month, day)
        if d.weekday() < 5 and not holiday_name(d) and d not in skip:
            count += 1
    return count


def needed_hours_for_month(
    year: int,
    month: int,
    settings: dict[str, Any],
    skip_dates: set[date] | None = None,
) -> tuple[int, float]:
    last = calendar.monthrange(year, month)[1]
    employment = str(settings.get("employment_type") or "part_time")
    if employment == "full_time":
        working = weekdays_in_month(year, month, skip_dates)
        shift = float(settings.get("full_time_shift_hours") or 8)
        return working, _r4(working * shift)
    # Part-time dohoda: 20 h/week = 4 h × weekdays. No paid leave, so vacation
    # and sviatky do not reduce the quota; hours above the weekly cap are OT.
    weekdays = sum(1 for day in range(1, last + 1) if date(year, month, day).weekday() < 5)
    daily = float(settings.get("contract_h_week") or 20) / 5.0
    return weekdays, _r4(weekdays * daily)


def overtime_hours_for_month(
    year: int,
    month: int,
    billed_hours: float,
    settings: dict[str, Any],
) -> float:
    """Hours above the part-time monthly quota (20 h/week = 4 h × weekdays)."""
    if str(settings.get("employment_type") or "part_time") == "full_time":
        return 0.0
    _, needed = needed_hours_for_month(year, month, settings)
    return _r4(max(0.0, float(billed_hours) - needed))


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
    clock_hours: float
    break_hours: float
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
    reported_hours: float | None = None

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
    clock = (end - start).total_seconds() / 3600.0
    break_after = float(settings.get("unpaid_break_after") or 6)
    break_len = float(settings.get("unpaid_break_hours") or 0.5)
    if reported_hours is not None:
        hours = max(0.0, float(reported_hours))
        break_h = max(0.0, clock - hours)
    elif clock > break_after + 1e-9:
        hours = max(0.0, clock - break_len)
        break_h = min(break_len, clock)
    else:
        hours = clock
        break_h = 0.0

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

    # Unpaid break is not working time, so premiums follow billable hours.
    if clock > 1e-9 and abs(hours - clock) > 1e-9:
        scale = hours / clock
        night *= scale
        sat *= scale
        sun *= scale
        hol *= scale

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
        hours=_r4(hours),
        clock_hours=_r4(clock),
        break_hours=_r4(break_h),
        night_h=_r4(night),
        sat_h=_r4(sat),
        sun_h=_r4(sun),
        holiday_h=_r4(hol),
        holiday_name=hol_names[0] if hol_names else None,
        day_type=day_type,
        basic=basic,
        sat_prem=sat_prem,
        sun_prem=sun_prem,
        night_prem=night_prem,
        holiday_prem=holiday_prem,
        ot_prem=ot_prem,
        brutto=brutto,
        reported_hours=None if reported_hours is None else _r4(float(reported_hours)),
    )


def income_tax(taxable: float, settings: dict[str, Any]) -> float:
    """2026 PIT: 19 / 25 / 30 / 35 % monthly brackets."""
    if taxable <= 0:
        return 0.0
    b19 = float(settings["bracket19"])
    b25 = float(settings.get("bracket25") or 5029.10)
    b30 = float(settings.get("bracket30") or 6250.86)
    t19 = float(settings["tax19"])
    t25 = float(settings["tax25"])
    t30 = float(settings.get("tax30") or 0.30)
    t35 = float(settings.get("tax35") or 0.35)
    if taxable <= b19:
        return _r2(taxable * t19)
    if taxable <= b25:
        return _r2(b19 * t19 + (taxable - b19) * t25)
    if taxable <= b30:
        return _r2(b19 * t19 + (b25 - b19) * t25 + (taxable - b25) * t30)
    return _r2(
        b19 * t19
        + (b25 - b19) * t25
        + (b30 - b25) * t30
        + (taxable - b30) * t35
    )


def is_student_dohoda(settings: dict[str, Any]) -> bool:
    employment = str(settings.get("employment_type") or "part_time")
    dohoda = str(settings.get("dohoda_type") or "student")
    return employment != "full_time" and dohoda != "worker"


def month_payroll(
    shifts: list[ShiftPay],
    settings: dict[str, Any],
    osobne: float = 0.0,
    year: int | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    hours = _r4(sum(s.hours for s in shifts))
    night_h = _r4(sum(s.night_h for s in shifts))
    sat_h = _r4(sum(s.sat_h for s in shifts))
    sun_h = _r4(sum(s.sun_h for s in shifts))
    holiday_h = _r4(sum(s.holiday_h for s in shifts))
    basic = _r2(sum(s.basic for s in shifts))
    sat_prem = _r2(sum(s.sat_prem for s in shifts))
    sun_prem = _r2(sum(s.sun_prem for s in shifts))
    night_prem = _r2(sum(s.night_prem for s in shifts))
    holiday_prem = _r2(sum(s.holiday_prem for s in shifts))
    ot_hours = 0.0
    if year is not None and month is not None:
        ot_hours = overtime_hours_for_month(year, month, hours, settings)
    ot_base = float(settings.get("avg_earnings") or 0) or float(settings.get("hourly_rate") or 0)
    ot_prem = _r2(ot_hours * ot_base * float(settings.get("prem_ot_pct") or 0.25))
    hruba = _r2(sum(s.brutto for s in shifts) + ot_prem + float(osobne or 0))

    if hruba <= 0:
        empty = {
            "days": 0,
            "hours": 0.0,
            "clock_hours": 0.0,
            "break_hours": 0.0,
            "night_h": 0.0,
            "sat_h": 0.0,
            "sun_h": 0.0,
            "holiday_h": 0.0,
            "basic": 0.0,
            "sat_prem": 0.0,
            "sun_prem": 0.0,
            "night_prem": 0.0,
            "holiday_prem": 0.0,
            "ot_hours": 0.0,
            "ot_prem": 0.0,
            "osobne": _r2(float(osobne or 0)),
            "hruba": 0.0,
            "oop_applied": 0.0,
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

    student = is_student_dohoda(settings)
    if student:
        oop = min(hruba, float(settings.get("oop") or 0)) if settings.get("apply_oop", True) else 0.0
        pension_base = max(0.0, _r2(hruba - oop))
        np = pvn = zp = 0.0
        sp = _r2(pension_base * float(settings["rate_sp"]))
        ip = _r2(pension_base * float(settings["rate_ip"]))
        odvody = _r2(sp + ip)
        er = (
            _r2(pension_base * float(settings["er_sp"]))
            + _r2(pension_base * float(settings["er_ip"]))
            + _r2(pension_base * float(settings["er_prfs"]))
            + _r2(hruba * float(settings["er_up"]))
            + _r2(hruba * float(settings["er_gp"]))
        )
        oop_applied = _r2(oop)
    else:
        np = _r2(hruba * float(settings["rate_np"]))
        sp = _r2(hruba * float(settings["rate_sp"]))
        ip = _r2(hruba * float(settings["rate_ip"]))
        pvn = _r2(hruba * float(settings["rate_pvn"]))
        zp = _r2(hruba * float(settings["rate_zp"]))
        odvody = _r2(np + sp + ip + pvn + zp)
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
        oop_applied = 0.0
    tax_base = _r2(hruba - odvody)
    nczd = float(settings["nczd"])
    apply = bool(settings.get("apply_nczd", True))
    nczd_applied = _r2(min(nczd, max(tax_base, 0.0))) if apply else 0.0
    taxable = max(0.0, tax_base - nczd_applied)
    dan = income_tax(taxable, settings)
    cista = _r2(hruba - odvody - dan)
    return {
        "days": len(shifts),
        "hours": hours,
        "clock_hours": _r4(sum(getattr(s, "clock_hours", s.hours) for s in shifts)),
        "break_hours": _r4(sum(getattr(s, "break_hours", 0) for s in shifts)),
        "night_h": night_h,
        "sat_h": sat_h,
        "sun_h": sun_h,
        "holiday_h": holiday_h,
        "basic": basic,
        "sat_prem": sat_prem,
        "sun_prem": sun_prem,
        "night_prem": night_prem,
        "holiday_prem": holiday_prem,
        "ot_hours": ot_hours,
        "ot_prem": ot_prem,
        "osobne": _r2(float(osobne or 0)),
        "hruba": hruba,
        "oop_applied": oop_applied,
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


def weeks_for_month(
    year: int,
    month: int,
    all_shifts: list[ShiftPay],
    settings: dict[str, Any],
) -> list[dict[str, Any]]:
    """Calendar weeks of this month only (clipped to month start/end)."""
    last = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, last)
    seen: list[tuple[int, int]] = []
    found: set[tuple[int, int]] = set()
    for day in range(1, last + 1):
        iso = date(year, month, day).isocalendar()
        key = (iso.year, iso.week)
        if key not in found:
            found.add(key)
            seen.append(key)
    hours_by_date: dict[str, float] = defaultdict(float)
    for shift in all_shifts:
        hours_by_date[shift.work_date] += float(shift.hours or 0)
    part_time = str(settings.get("employment_type") or "part_time") != "full_time"
    if part_time:
        needed = float(settings.get("contract_h_week") or 20)
    else:
        needed = 5.0 * float(settings.get("full_time_shift_hours") or 8)
    weeks = []
    for iso_year, iso_week in seen:
        monday = date.fromisocalendar(iso_year, iso_week, 1)
        sunday = date.fromisocalendar(iso_year, iso_week, 7)
        start = max(monday, month_start)
        end = min(sunday, month_end)
        total = 0.0
        cursor = start
        while cursor <= end:
            total += hours_by_date.get(cursor.isoformat(), 0.0)
            cursor += timedelta(days=1)
        overtime = _r4(max(0.0, total - needed))
        weeks.append(
            {
                "week": len(weeks) + 1,
                "iso_week": iso_week,
                "iso_year": iso_year,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "hours": _r4(total),
                "needed": _r4(needed),
                "overtime": overtime,
            }
        )
    return weeks

