"""Local FastAPI app for the MCGA salary dashboard."""

from __future__ import annotations

import json
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field

from holidays import holidays_in_month
from parser import parse_export
from payroll import compute_shift, month_payroll, needed_hours_for_month, weeks_for_month
from storage import (
    STATE_PATH,
    UNDO_LIMIT,
    StateError,
    active_profile,
    default_profile,
    load_state,
    save_state,
    settings_for_year,
    slug_profile_id,
    validate_state,
)
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


class ImportResolve(BaseModel):
    overwrite: list[str] = Field(default_factory=list)


class PreviewBody(BaseModel):
    hourly_rate: float


class ProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9_-]{0,47}$")


class ProfileSwitch(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,47}$")


def _shift_sig(shift: dict[str, Any]) -> tuple:
    hours = shift.get("reported_hours")
    if hours is not None:
        hours = round(float(hours), 4)
    return (shift.get("start"), shift.get("end"), hours)


def _shifts_by_date(shifts: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for shift in shifts:
        grouped[shift["date"]].append(shift)
    for day in grouped:
        grouped[day].sort(key=_shift_sig)
    return grouped


def _public_shifts(shifts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "start": s.get("start"),
            "end": s.get("end"),
            "reported_hours": s.get("reported_hours"),
        }
        for s in shifts
    ]


def diff_import(existing: list[dict[str, Any]], incoming: list[dict[str, Any]]) -> dict[str, Any]:
    old = _shifts_by_date(existing)
    new = _shifts_by_date(incoming)
    new_dates: list[str] = []
    same_dates: list[str] = []
    conflicts: list[dict[str, Any]] = []
    for day, inc in sorted(new.items()):
        stored = old.get(day)
        if not stored:
            new_dates.append(day)
        elif [_shift_sig(s) for s in stored] == [_shift_sig(s) for s in inc]:
            same_dates.append(day)
        else:
            conflicts.append(
                {
                    "date": day,
                    "existing": _public_shifts(stored),
                    "incoming": _public_shifts(inc),
                }
            )
    return {"new_dates": new_dates, "same_dates": same_dates, "conflicts": conflicts}


def merge_import(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
    overwrite_dates: set[str],
) -> list[dict[str, Any]]:
    old = _shifts_by_date(existing)
    new = _shifts_by_date(incoming)
    merged: list[dict[str, Any]] = []
    for day in sorted(set(old) | set(new)):
        if day not in new:
            merged.extend(old[day])
            continue
        if day not in old:
            merged.extend(new[day])
            continue
        same = [_shift_sig(s) for s in old[day]] == [_shift_sig(s) for s in new[day]]
        if same or day not in overwrite_dates:
            merged.extend(old[day])
        else:
            merged.extend(new[day])
    merged.sort(key=lambda s: (s["date"], s["start"]))
    return merged


def _commit_import(state: dict[str, Any], pending: dict[str, Any], overwrite_dates: set[str]) -> dict[str, Any]:
    bag = active_profile(state)
    incoming = pending["shifts"]
    merged = merge_import(bag.get("shifts", []), incoming, overwrite_dates)
    replaced = len(overwrite_dates)
    undos = list(bag.get("import_undos") or [])
    undos.append(
        {
            "shifts": deepcopy(bag.get("shifts", [])),
            "imports": deepcopy(bag.get("imports", [])),
        }
    )
    bag["import_undos"] = undos[-UNDO_LIMIT:]
    bag["shifts"] = merged
    bag.setdefault("imports", []).append(
        {
            "filename": pending.get("filename"),
            "employee": pending.get("employee"),
            "department": pending.get("department"),
            "imported_at": datetime.now().isoformat(timespec="seconds"),
            "shift_count": len(incoming),
            "replaced_dates": replaced,
            "kept_dates": len(pending.get("conflicts") or []) - replaced,
        }
    )
    bag.pop("pending_import", None)
    bag.pop("import_undo", None)
    save_state(state)
    report = build_report(state)
    report["import_meta"] = {
        "employee": pending.get("employee"),
        "department": pending.get("department"),
        "added": len(pending.get("new_dates") or []),
        "unchanged": len(pending.get("same_dates") or []),
        "replaced": replaced,
        "kept": len(pending.get("conflicts") or []) - replaced,
    }
    return report


def _parse_time(hhmm: str):
    return datetime.strptime(hhmm, "%H:%M").time()


def _paid_shifts(bag: dict[str, Any]) -> list:
    settings = bag["settings"]
    paid = []
    for raw in bag.get("shifts", []):
        work_date = date.fromisoformat(raw["date"])
        paid.append(
            compute_shift(
                work_date,
                _parse_time(raw["start"]),
                _parse_time(raw["end"]),
                settings_for_year(settings, work_date.year),
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
    bag = active_profile(state)
    paid = _paid_shifts(bag)
    by_month: dict[str, list] = defaultdict(list)
    for shift in paid:
        by_month[_month_key(shift.work_date)].append(shift)

    months = []
    for key in sorted(by_month):
        year_s, month_s = key.split("-")
        year_i, month_i = int(year_s), int(month_s)
        vac = _vacation_for_month(bag, key)
        skip = set()
        for iso in vac.get("dates") or []:
            try:
                skip.add(date.fromisoformat(iso))
            except ValueError:
                continue
        year_settings = settings_for_year(bag["settings"], year_i)
        weeks = weeks_for_month(year_i, month_i, by_month[key], year_settings)
        payroll = month_payroll(
            by_month[key],
            year_settings,
            float(bag.get("osobne", {}).get(key, 0) or 0),
            year=year_i,
            month=month_i,
            weeks=weeks,
        )
        recv = bag.get("received", {}).get(key, {})
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
        working_days, needed_hours = needed_hours_for_month(year_i, month_i, year_settings, skip)
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
                "weeks": weeks,
                "shifts": [s.to_dict() for s in by_month[key]],
                "vacation": vac,
                "holidays": holidays_in_month(year_i, month_i),
            }
        )

    years = sorted({m["month"][:4] for m in months})
    undos = bag.get("import_undos") or []
    return {
        "settings": bag["settings"],
        "employee": next((i.get("employee") for i in reversed(bag.get("imports", [])) if i.get("employee")), None),
        "updated_at": state.get("updated_at"),
        "imports": bag.get("imports", []),
        "years": years,
        "months": months,
        "shift_count": len(paid),
        "can_undo_import": bool(undos),
        "undo_count": len(undos),
        "active_profile": state.get("active_profile") or "default",
        "profiles": [
            {"id": pid, "name": str((p.get("settings") or {}).get("name") or pid).strip() or pid}
            for pid, p in (state.get("profiles") or {}).items()
        ],
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
    return active_profile(load_state())["settings"]


@app.put("/api/settings")
def put_settings(body: SettingsUpdate):
    state = load_state()
    active_profile(state)["settings"].update(body.settings)
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

    state = load_state()
    bag = active_profile(state)
    diff = diff_import(bag.get("shifts", []), parsed["shifts"])
    pending = {
        "filename": parsed.get("source_name"),
        "employee": parsed.get("employee"),
        "department": parsed.get("department"),
        "shifts": parsed["shifts"],
        **diff,
    }
    if not diff["conflicts"]:
        return _commit_import(state, pending, set())

    bag["pending_import"] = pending
    save_state(state)
    return {
        "preview": True,
        "filename": pending["filename"],
        "employee": pending["employee"],
        "new_count": len(diff["new_dates"]),
        "same_count": len(diff["same_dates"]),
        "conflicts": diff["conflicts"],
    }


@app.post("/api/import/resolve")
def import_resolve(body: ImportResolve):
    state = load_state()
    pending = active_profile(state).get("pending_import")
    if not isinstance(pending, dict) or not pending.get("shifts"):
        raise HTTPException(400, "No import waiting for a decision. Drop the file again.")
    allowed = {c["date"] for c in pending.get("conflicts") or []}
    overwrite = {d for d in body.overwrite if d in allowed}
    return _commit_import(state, pending, overwrite)


@app.post("/api/import/cancel")
def import_cancel():
    state = load_state()
    active_profile(state).pop("pending_import", None)
    save_state(state)
    return {"ok": True}


@app.post("/api/import/undo")
def import_undo():
    state = load_state()
    bag = active_profile(state)
    undos = list(bag.get("import_undos") or [])
    if not undos:
        raise HTTPException(400, "Nothing to undo.")
    snap = undos.pop()
    bag["shifts"] = snap.get("shifts") or []
    bag["imports"] = snap.get("imports") or []
    bag["import_undos"] = undos
    save_state(state)
    report = build_report(state)
    report["import_meta"] = {"undone": True}
    return report


@app.get("/api/backup")
def download_backup():
    state = load_state()
    save_state(state)
    return FileResponse(
        STATE_PATH,
        media_type="application/json",
        filename="salary-state.json",
    )


@app.post("/api/restore")
async def restore_backup(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, "Not a JSON backup.") from exc
    try:
        state = validate_state(payload)
    except StateError as exc:
        raise HTTPException(400, str(exc)) from exc
    save_state(state)
    return build_report(state)


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
    active_profile(state).setdefault("vacation", {})[body.month] = {"dates": dates, "notes": notes}
    save_state(state)
    return build_report(state)


@app.post("/api/received")
def save_received(body: ReceivedUpdate):
    state = load_state()
    bag = active_profile(state)
    entry = bag.setdefault("received", {}).get(body.month, {})
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
    bag["received"][body.month] = entry
    if body.osobne is not None:
        bag.setdefault("osobne", {})[body.month] = body.osobne
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
    shifts = active_profile(state).setdefault("shifts", [])
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
    shifts = active_profile(state).setdefault("shifts", [])
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
    bag = active_profile(state)
    key = (date_s, start, end)
    before = len(bag.get("shifts", []))
    bag["shifts"] = [s for s in bag.get("shifts", []) if _shift_key(s) != key]
    if len(bag["shifts"]) == before:
        raise HTTPException(404, "Shift not found.")
    save_state(state)
    return build_report(state)


@app.post("/api/preview")
def preview(body: PreviewBody):
    state = deepcopy(load_state())
    bag = active_profile(state)
    original_rate = bag["settings"].get("hourly_rate")
    bag["settings"]["hourly_rate"] = float(body.hourly_rate)
    report = build_report(state)
    report["settings"]["hourly_rate"] = original_rate
    report["preview"] = {"hourly_rate": float(body.hourly_rate)}
    return report


@app.delete("/api/shifts")
def clear_shifts():
    state = load_state()
    bag = active_profile(state)
    bag["shifts"] = []
    bag["imports"] = []
    bag["import_undos"] = []
    bag.pop("pending_import", None)
    bag.pop("import_undo", None)
    save_state(state)
    return build_report(state)


@app.post("/api/profiles")
def create_profile(body: ProfileCreate):
    state = load_state()
    pid = body.id or slug_profile_id(body.name)
    profiles = state.setdefault("profiles", {})
    if pid in profiles:
        raise HTTPException(400, f"Profile {pid} already exists.")
    bag = default_profile()
    current = active_profile(state)
    bag["settings"] = deepcopy(current.get("settings") or bag["settings"])
    bag["settings"]["name"] = body.name.strip()
    profiles[pid] = bag
    state["active_profile"] = pid
    save_state(state)
    return build_report(state)


@app.post("/api/profiles/switch")
def switch_profile(body: ProfileSwitch):
    state = load_state()
    if body.id not in (state.get("profiles") or {}):
        raise HTTPException(404, "Profile not found.")
    state["active_profile"] = body.id
    save_state(state)
    return build_report(state)


@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: str):
    state = load_state()
    profiles = state.get("profiles") or {}
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found.")
    if len(profiles) < 2:
        raise HTTPException(400, "Cannot delete the last profile.")
    profiles.pop(profile_id)
    if state.get("active_profile") == profile_id:
        state["active_profile"] = next(iter(profiles))
    save_state(state)
    return build_report(state)
