"""Local FastAPI app for the MCGA salary dashboard."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from holidays import holidays_in_month
from parser import parse_export
from payroll import compute_shift, month_payroll, needed_hours_for_month
from storage import load_state, save_state

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


class VacationUpdate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    dates: list[str] = Field(default_factory=list)
    notes: dict[str, str] = Field(default_factory=dict)


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
        received = recv.get("amount") if isinstance(recv, dict) else recv
        note = recv.get("note", "") if isinstance(recv, dict) else ""
        received_f = None if received in (None, "") else float(received)
        if received_f == 0:
            received_f = None
        cista = payroll["cista"]
        diff = None if received_f is None else round(received_f - cista, 2)
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
                "difference": diff,
                "working_days": working_days,
                "needed_hours": needed_hours,
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
    state["received"][body.month] = entry
    if body.osobne is not None:
        state["osobne"][body.month] = body.osobne
    save_state(state)
    return build_report(state)


@app.delete("/api/shifts")
def clear_shifts():
    state = load_state()
    state["shifts"] = []
    state["imports"] = []
    save_state(state)
    return build_report(state)
