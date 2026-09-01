"""Local FastAPI app for the MCGA salary dashboard."""

from __future__ import annotations

from copy import deepcopy
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from holidays import holidays_in_month
from parser import parse_export
from payroll import compute_shift, month_payroll, needed_hours_for_month, weeks_for_month
from storage import load_state, save_state
from stub import (
    compact_stub,
    explain_month,
    received_from_entry,
    reconcile_month,
    stub_incomplete,
)

app = FastAPI(title="MCGA Salary Calculator", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SettingsUpdate(BaseModel):
    settings: dict[str, Any]


class ReceivedUpdate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    received: float | None = None
    note: str = ""
    osobne: float | None = None
    stub: dict[str, Any] | None = None


class VacationUpdate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    dates: list[str] = Field(default_factory=list)
    notes: dict[str, str] = Field(default_factory=dict)


class ShiftBody(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    reported_hours: float | None = None
    old_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    old_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    old_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class PreviewBody(BaseModel):
    hourly_rate: float


def _parse_time(hhmm: str):
    return datetime.strptime(hhmm, "%H:%M").time()


def _paid_shifts(state: dict[str, Any]) -> list:
    settings = state["settings"]
    paid = []
    for raw in state.get("shifts", []):
        work_date = date.fromisoformat(raw["date"])
        paid.append(
            compute_shift(
                work_date,
                _parse_time(raw["start"]),
                _parse_time(raw["end"]),
                settings,
                raw.get("reported_hours"),
            )
        )
    return paid


def _month_key(iso_date: str) -> str:
    return iso_date[:7]


def _vacation_for_month(state: dict[str, Any], key: str) -> dict[str, Any]:
    raw = (state.get("vacation") or {}).get(key) or {}
    if isinstance(raw, list):
        return {"dates": [d for d in raw if isinstance(d, str)], "notes": {}}
    dates = [d for d in (raw.get("dates") or []) if isinstance(d, str)]
    notes = {k: str(v) for k, v in (raw.get("notes") or {}).items() if str(v).strip()}
    return {"dates": dates, "notes": notes}


def build_report(state: dict[str, Any]) -> dict[str, Any]:
    paid = _paid_shifts(state)
    by_month: dict[str, list] = defaultdict(list)
    for shift in paid:
        by_month[_month_key(shift.work_date)].append(shift)

    months = []
    for key in sorted(by_month):
        year_s, month_s = key.split("-")
        year_i, month_i = int(year_s), int(month_s)
        payroll = month_payroll(
            by_month[key],
            state["settings"],
            float(state.get("osobne", {}).get(key, 0) or 0),
            year=year_i,
            month=month_i,
        )
        recv = state.get("received", {}).get(key, {})
        if not isinstance(recv, dict):
            recv = {"amount": recv, "note": ""}
        stub = recv.get("stub") if isinstance(recv.get("stub"), dict) else {}
        received_f = received_from_entry(recv)
        note = recv.get("note", "") if isinstance(recv, dict) else ""
        cista = payroll["cista"]
        diff = None if received_f is None else round(received_f - cista, 2)
        incomplete = stub_incomplete(recv, received_f)
        recon = reconcile_month(payroll, stub)
        explainer = explain_month(payroll, stub, incomplete)
        vac = _vacation_for_month(state, key)
        skip = set()
        for iso in vac.get("dates") or []:
            try:
                skip.add(date.fromisoformat(iso))
            except ValueError:
                continue
        working_days, needed_hours = needed_hours_for_month(
            year_i, month_i, state["settings"], skip
        )
        months.append(
            {
                "month": key,
                "label": datetime(year_i, month_i, 1).strftime("%B %Y"),
                **payroll,
                "received": received_f,
                "note": note,
                "stub": stub,
                "stub_incomplete": incomplete,
                "reconcile": recon,
                "explainer": explainer,
                "difference": diff,
                "working_days": working_days,
                "needed_hours": needed_hours,
                "weeks": weeks_for_month(year_i, month_i, paid, state["settings"]),
                "shifts": [s.to_dict() for s in by_month[key]],
                "vacation": vac,
                "holidays": holidays_in_month(year_i, month_i),
            }
        )

    years = sorted({m["month"][:4] for m in months})
    return {
        "settings": state["settings"],
        "employee": next((i.get("employee") for i in reversed(state.get("imports", [])) if i.get("employee")), None),
        "updated_at": state.get("updated_at"),
        "imports": state.get("imports", []),
        "years": years,
        "months": months,
        "shift_count": len(paid),
    }


@app.get("/")
def root():
    return RedirectResponse("http://127.0.0.1:5173/")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/report")
def report():
    return build_report(load_state())


@app.get("/api/settings")
def get_settings():
    return load_state()["settings"]


@app.put("/api/settings")
def put_settings(body: SettingsUpdate):
    state = load_state()
    state["settings"].update(body.settings)
    save_state(state)
    return build_report(state)


@app.post("/api/import")
async def import_file(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    try:
        parsed = parse_export(raw, file.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not parsed["shifts"]:
        raise HTTPException(400, "No shifts found in this file.")

    state = load_state()
    existing = {(s["date"], s["start"], s["end"]): s for s in state.get("shifts", [])}
    incoming = parsed["shifts"]
    replaced = 0
    by_date = {s["date"] for s in incoming}
    kept = [s for s in existing.values() if s["date"] not in by_date]
    for s in incoming:
        key = (s["date"], s["start"], s["end"])
        if key in existing:
            replaced += 1
        existing[key] = s
    # Replace all shifts on dates present in the new file; keep other dates.
    merged = kept + incoming
    merged.sort(key=lambda s: (s["date"], s["start"]))
    state["shifts"] = merged
    state["imports"].append(
        {
            "filename": parsed.get("source_name"),
            "employee": parsed.get("employee"),
            "department": parsed.get("department"),
            "imported_at": datetime.now().isoformat(timespec="seconds"),
            "shift_count": len(incoming),
            "replaced_dates": len(by_date),
        }
    )
    save_state(state)
    report = build_report(state)
    report["import_meta"] = {
        "employee": parsed["employee"],
        "department": parsed["department"],
        "added": len(incoming),
        "replaced": replaced,
    }
    return report


@app.put("/api/vacation")
def save_vacation(body: VacationUpdate):
    state = load_state()
    prefix = f"{body.month}-"
    dates = sorted({d for d in body.dates if isinstance(d, str) and d.startswith(prefix)})
    notes = {
        iso: text.strip()
        for iso, text in (body.notes or {}).items()
        if isinstance(iso, str) and iso.startswith(prefix) and str(text).strip()
    }
    state.setdefault("vacation", {})[body.month] = {"dates": dates, "notes": notes}
    save_state(state)
    return build_report(state)


@app.post("/api/received")
def save_received(body: ReceivedUpdate):
    state = load_state()
    entry = state["received"].get(body.month, {})
    if not isinstance(entry, dict):
        entry = {"amount": entry, "note": ""}
    if body.received is None:
        entry.pop("amount", None)
    else:
        entry["amount"] = body.received
    if body.note is not None:
        entry["note"] = body.note
    if body.stub is not None:
        packed = compact_stub(body.stub)
        if packed:
            entry["stub"] = packed
        else:
            entry.pop("stub", None)
    state["received"][body.month] = entry
    if body.osobne is not None:
        state["osobne"][body.month] = body.osobne
    save_state(state)
    return build_report(state)


def _shift_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return (item["date"], item["start"], item["end"])


def _validate_shift(date_s: str, start_s: str, end_s: str) -> None:
    try:
        date.fromisoformat(date_s)
        _parse_time(start_s)
        _parse_time(end_s)
    except ValueError as exc:
        raise HTTPException(400, "Invalid date or time.") from exc


def _shift_payload(body: ShiftBody) -> dict[str, Any]:
    row: dict[str, Any] = {"date": body.date, "start": body.start, "end": body.end}
    if body.reported_hours is not None:
        row["reported_hours"] = round(float(body.reported_hours), 4)
    return row


@app.post("/api/shift")
def add_shift(body: ShiftBody):
    _validate_shift(body.date, body.start, body.end)
    state = load_state()
    shifts = state.setdefault("shifts", [])
    key = (body.date, body.start, body.end)
    if any(_shift_key(s) == key for s in shifts):
        raise HTTPException(400, "A shift with this date and time already exists.")
    shifts.append(_shift_payload(body))
    shifts.sort(key=lambda s: (s["date"], s["start"]))
    save_state(state)
    return build_report(state)


@app.put("/api/shift")
def replace_shift(body: ShiftBody):
    old_date = body.old_date or body.date
    old_start = body.old_start or body.start
    old_end = body.old_end or body.end
    _validate_shift(old_date, old_start, old_end)
    _validate_shift(body.date, body.start, body.end)
    state = load_state()
    shifts = state.setdefault("shifts", [])
    old_key = (old_date, old_start, old_end)
    new_key = (body.date, body.start, body.end)
    idx = next((i for i, s in enumerate(shifts) if _shift_key(s) == old_key), None)
    if idx is None:
        raise HTTPException(404, "Shift not found.")
    if new_key != old_key and any(_shift_key(s) == new_key for s in shifts):
        raise HTTPException(400, "A shift with this date and time already exists.")
    shifts[idx] = _shift_payload(body)
    shifts.sort(key=lambda s: (s["date"], s["start"]))
    save_state(state)
    return build_report(state)


@app.delete("/api/shift")
def delete_shift(
    date_s: str = Query(..., alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    start: str = Query(..., pattern=r"^\d{2}:\d{2}$"),
    end: str = Query(..., pattern=r"^\d{2}:\d{2}$"),
):
    _validate_shift(date_s, start, end)
    state = load_state()
    key = (date_s, start, end)
    before = len(state.get("shifts", []))
    state["shifts"] = [s for s in state.get("shifts", []) if _shift_key(s) != key]
    if len(state["shifts"]) == before:
        raise HTTPException(404, "Shift not found.")
    save_state(state)
    return build_report(state)


@app.post("/api/preview")
def preview(body: PreviewBody):
    state = deepcopy(load_state())
    original_rate = state["settings"].get("hourly_rate")
    state["settings"]["hourly_rate"] = float(body.hourly_rate)
    report = build_report(state)
    report["settings"]["hourly_rate"] = original_rate
    report["preview"] = {"hourly_rate": float(body.hourly_rate)}
    return report


@app.delete("/api/shifts")
def clear_shifts():
    state = load_state()
    state["shifts"] = []
    state["imports"] = []
    save_state(state)
    return build_report(state)
