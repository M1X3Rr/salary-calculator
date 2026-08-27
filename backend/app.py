"""Local FastAPI app for the MCGA salary dashboard."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from parser import parse_export
from payroll import compute_shift, month_payroll
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


def build_report(state: dict[str, Any]) -> dict[str, Any]:
    paid = _paid_shifts(state)
    by_month: dict[str, list] = defaultdict(list)
    for shift in paid:
        by_month[_month_key(shift.work_date)].append(shift)

    months = []
    for key in sorted(by_month):
        year_s, month_s = key.split("-")
        payroll = month_payroll(
            by_month[key],
            state["settings"],
            float(state.get("osobne", {}).get(key, 0) or 0),
        )
        recv = state.get("received", {}).get(key, {})
        received = recv.get("amount") if isinstance(recv, dict) else recv
        note = recv.get("note", "") if isinstance(recv, dict) else ""
        received_f = None if received in (None, "") else float(received)
        cista = payroll["cista"]
        diff = None if received_f is None else round(received_f - cista, 2)
        months.append(
            {
                "month": key,
                "label": datetime(int(year_s), int(month_s), 1).strftime("%B %Y"),
                **payroll,
                "received": received_f,
                "note": note,
                "difference": diff,
                "shifts": [s.to_dict() for s in by_month[key]],
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


@app.post("/api/received")
def save_received(body: ReceivedUpdate):
    state = load_state()
    entry = state["received"].get(body.month, {})
    if not isinstance(entry, dict):
        entry = {"amount": entry, "note": ""}
    if body.received is not None:
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
