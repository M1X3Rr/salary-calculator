"""Parse MCGA HTML .xls hour exports (Excel HTML calendar)."""

from __future__ import annotations

import re
from datetime import date, datetime, time
from pathlib import Path

from bs4 import BeautifulSoup

MONTHS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}
WEEKDAYS = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}

HEADER_RE = re.compile(
    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$"
)
HEADER_SHORT_RE = re.compile(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})$")
DURATION_RE = re.compile(r"(\d+)\s*h(?:\s+(\d+)\s*m)?", re.I)
TIME_RANGE_RE = re.compile(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})")
FILENAME_DATE_RE = re.compile(r"(20\d{2})(\d{2})(\d{2})")


def infer_export_year(filename: str | None, fallback: int | None = None) -> int:
    if filename:
        m = FILENAME_DATE_RE.search(Path(filename).name)
        if m:
            return int(m.group(1))
    return fallback or date.today().year


def infer_export_month(filename: str | None) -> int | None:
    if not filename:
        return None
    m = FILENAME_DATE_RE.search(Path(filename).name)
    if not m:
        return None
    month = int(m.group(2))
    if 1 <= month <= 12:
        return month
    return None


def _date_for_weekday(year: int, month: int, day: int, want: int) -> date | None:
    for y in (year, year - 1, year + 1):
        try:
            d = date(y, month, day)
        except ValueError:
            continue
        if d.weekday() == want:
            return d
    try:
        return date(year, month, day)
    except ValueError:
        return None


def resolve_header_date(label: str, export_year: int, export_month: int | None = None) -> date | None:
    text = label.strip()
    m = HEADER_RE.match(text)
    if m:
        wd_name, mon_name, day_s = m.groups()
        return _date_for_weekday(export_year, MONTHS[mon_name], int(day_s), WEEKDAYS[wd_name])
    short = HEADER_SHORT_RE.match(text)
    if short and export_month:
        wd_name, day_s = short.groups()
        return _date_for_weekday(export_year, export_month, int(day_s), WEEKDAYS[wd_name])
    return None


def parse_time(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def parse_cell(text: str) -> dict | None:
    raw = " ".join(text.split())
    if not raw:
        return None
    rng = TIME_RANGE_RE.search(raw)
    if not rng:
        return None
    start = parse_time(rng.group(1))
    end = parse_time(rng.group(2))
    dur_m = DURATION_RE.search(raw)
    reported = None
    if dur_m:
        reported = int(dur_m.group(1)) + int(dur_m.group(2) or 0) / 60.0
    return {"start": start, "end": end, "reported_hours": reported, "raw": raw}


def parse_export(content: bytes | str, filename: str | None = None) -> dict:
    if isinstance(content, bytes):
        text = content.decode("utf-8-sig", errors="replace")
    else:
        text = content
    soup = BeautifulSoup(text, "html.parser")
    table = soup.find("table")
    if table is None:
        raise ValueError("No HTML table found — this does not look like an MCGA hour export.")

    header_row = table.find("tr")
    if header_row is None:
        raise ValueError("Export table has no header row.")
    headers = [th.get_text(" ", strip=True) for th in header_row.find_all(["th", "td"])]
    export_year = infer_export_year(filename)
    export_month = infer_export_month(filename)
    dates: list[date | None] = [None]
    for label in headers[1:]:
        dates.append(resolve_header_date(label, export_year, export_month))

    employee = None
    department = None
    shifts: list[dict] = []

    body_rows = table.find_all("tr")[1:]
    for tr in body_rows:
        cells = tr.find_all("td")
        if not cells:
            continue
        first = cells[0].get_text(" ", strip=True)
        bold = cells[0].find("b")
        if bold and len(cells) == 1:
            department = bold.get_text(" ", strip=True) or first
            continue
        if first and not employee:
            employee = first

        for idx, td in enumerate(cells[1:], start=1):
            if idx >= len(dates) or dates[idx] is None:
                continue
            parsed = parse_cell(td.get_text(" ", strip=True))
            if not parsed:
                continue
            work_date: date = dates[idx]
            shifts.append(
                {
                    "date": work_date.isoformat(),
                    "start": parsed["start"].strftime("%H:%M"),
                    "end": parsed["end"].strftime("%H:%M"),
                    "reported_hours": round(parsed["reported_hours"], 4)
                    if parsed["reported_hours"] is not None
                    else None,
                }
            )

    # Stable unique by date+start+end (re-import replaces same day later in storage)
    shifts.sort(key=lambda s: (s["date"], s["start"]))
    return {
        "employee": employee or "Unknown",
        "department": department,
        "export_year": export_year,
        "shifts": shifts,
        "source_name": Path(filename).name if filename else None,
    }
