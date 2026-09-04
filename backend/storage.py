"""Local JSON persistence for settings, shifts, and received amounts."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STATE_PATH = DATA_DIR / "state.json"

UNDO_LIMIT = 5
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")

DEFAULT_SETTINGS: dict[str, Any] = {
    "name": "Name Surname",
    "department": "DepName",
    "personal_no": "N0000",
    "employer": "Employer Name",
    "health_insurer": "Health Insurer Name",
    "hourly_rate": 8.0,
    "avg_earnings": 0.0,
    "employment_type": "part_time",
    "dohoda_type": "student",
    "apply_nczd": True,
    "apply_oop": True,
    "oop": 200.0,
    "contract_h_week": 20,
    "rate_np": 0.014,
    "rate_sp": 0.04,
    "rate_ip": 0.03,
    "rate_pvn": 0.01,
    "rate_zp": 0.05,
    "nczd": 497.23,
    "tax19": 0.19,
    "tax25": 0.25,
    "tax30": 0.30,
    "tax35": 0.35,
    "bracket19": 3665.28,
    "bracket25": 5029.10,
    "bracket30": 6250.86,
    "prem_sat": 2.6295,
    "prem_sun": 5.259,
    "prem_night": 2.1036,
    "prem_hol_pct": 1.0,
    "prem_ot_pct": 0.25,
    "unpaid_break_after": 6.0,
    "unpaid_break_hours": 0.5,
    "min_wage_month": 915.0,
    "min_wage_hour": 5.259,
    "full_time_shift_hours": 8.0,
    "er_np": 0.014,
    "er_sp": 0.14,
    "er_ip": 0.03,
    "er_pvn": 0.005,
    "er_pfp": 0.005,
    "er_up": 0.008,
    "er_gp": 0.0025,
    "er_prfs": 0.0475,
    "er_zp": 0.11,
}

STATUTORY_KEYS = (
    "rate_np",
    "rate_sp",
    "rate_ip",
    "rate_pvn",
    "rate_zp",
    "nczd",
    "tax19",
    "tax25",
    "tax30",
    "tax35",
    "bracket19",
    "bracket25",
    "bracket30",
    "prem_sat",
    "prem_sun",
    "prem_night",
    "prem_hol_pct",
    "prem_ot_pct",
    "min_wage_month",
    "min_wage_hour",
    "er_np",
    "er_sp",
    "er_ip",
    "er_pvn",
    "er_pfp",
    "er_up",
    "er_gp",
    "er_prfs",
    "er_zp",
)

STATUTORY_BY_YEAR: dict[int, dict[str, Any]] = {
    2026: {key: DEFAULT_SETTINGS[key] for key in STATUTORY_KEYS},
}


class StateError(ValueError):
    """Invalid payroll backup or on-disk state."""


def default_profile() -> dict[str, Any]:
    return {
        "settings": deepcopy(DEFAULT_SETTINGS),
        "shifts": [],
        "received": {},
        "osobne": {},
        "vacation": {},
        "imports": [],
        "import_undos": [],
    }


def default_state() -> dict[str, Any]:
    return {
        "active_profile": "default",
        "profiles": {"default": default_profile()},
        "updated_at": None,
    }


def settings_for_year(settings: dict[str, Any], year: int) -> dict[str, Any]:
    """Statutory table for that calendar year; 2026 (and unknown years) use live settings."""
    table = STATUTORY_BY_YEAR.get(year)
    if not table or year == 2026:
        return settings
    return {**settings, **table}


def slug_profile_id(name: str) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return (raw or "profile")[:48]


def _parse_shift_times(date_s: str, start_s: str, end_s: str) -> None:
    if not DATE_RE.match(date_s or "") or not TIME_RE.match(start_s or "") or not TIME_RE.match(end_s or ""):
        raise StateError(f"Invalid shift date or time: {date_s} {start_s}–{end_s}.")
    try:
        date.fromisoformat(date_s)
        datetime.strptime(start_s, "%H:%M")
        datetime.strptime(end_s, "%H:%M")
    except ValueError as exc:
        raise StateError(f"Invalid shift date or time: {date_s} {start_s}–{end_s}.") from exc


def _validate_shift_row(shift: Any, index: int) -> dict[str, Any]:
    if not isinstance(shift, dict):
        raise StateError(f"Shift {index} is not an object.")
    date_s = shift.get("date")
    start_s = shift.get("start")
    end_s = shift.get("end")
    if not isinstance(date_s, str) or not isinstance(start_s, str) or not isinstance(end_s, str):
        raise StateError(f"Shift {index} is missing date, start, or end.")
    _parse_shift_times(date_s, start_s, end_s)
    row: dict[str, Any] = {"date": date_s, "start": start_s, "end": end_s}
    hours = shift.get("reported_hours")
    if hours is not None:
        try:
            row["reported_hours"] = round(float(hours), 4)
        except (TypeError, ValueError) as exc:
            raise StateError(f"Shift {index} has invalid reported_hours.") from exc
    return row


def _validate_month_map(raw: Any, label: str) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise StateError(f"{label} must be an object keyed by YYYY-MM.")
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not MONTH_RE.match(key):
            raise StateError(f"{label} key {key!r} is not YYYY-MM.")
        out[key] = value
    return out


def _validate_vacation(raw: Any) -> dict[str, Any]:
    months = _validate_month_map(raw, "vacation")
    out: dict[str, Any] = {}
    for key, value in months.items():
        if isinstance(value, list):
            dates = value
            notes: dict[str, Any] = {}
        elif isinstance(value, dict):
            dates = value.get("dates") or []
            notes = value.get("notes") or {}
        else:
            raise StateError(f"vacation.{key} must be an object or list.")
        if not isinstance(dates, list):
            raise StateError(f"vacation.{key}.dates must be a list.")
        clean_dates = []
        prefix = f"{key}-"
        for iso in dates:
            if not isinstance(iso, str) or not DATE_RE.match(iso) or not iso.startswith(prefix):
                raise StateError(f"vacation.{key} has an invalid date {iso!r}.")
            try:
                date.fromisoformat(iso)
            except ValueError as exc:
                raise StateError(f"vacation.{key} has an invalid date {iso!r}.") from exc
            clean_dates.append(iso)
        if not isinstance(notes, dict):
            raise StateError(f"vacation.{key}.notes must be an object.")
        clean_notes = {}
        for iso, text in notes.items():
            if not isinstance(iso, str) or not DATE_RE.match(iso):
                raise StateError(f"vacation.{key}.notes has an invalid date key.")
            clean_notes[iso] = str(text)
        out[key] = {"dates": clean_dates, "notes": clean_notes}
    return out


def _validate_undos(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, dict) and ("shifts" in raw or "imports" in raw):
        raw = [raw]
    if not isinstance(raw, list):
        raise StateError("import_undos must be a list.")
    out = []
    for item in raw[-UNDO_LIMIT:]:
        if not isinstance(item, dict):
            raise StateError("Each import undo snapshot must be an object.")
        shifts = item.get("shifts") or []
        imports = item.get("imports") or []
        if not isinstance(shifts, list) or not isinstance(imports, list):
            raise StateError("Undo snapshot shifts and imports must be lists.")
        out.append(
            {
                "shifts": [_validate_shift_row(s, i) for i, s in enumerate(shifts)],
                "imports": [x for x in imports if isinstance(x, dict)],
            }
        )
    return out


def _validate_profile(raw: Any, label: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise StateError(f"Profile {label} must be an object.")
    if "settings" not in raw or not isinstance(raw.get("settings"), dict):
        raise StateError(f"Profile {label} is missing settings.")
    shifts_raw = raw.get("shifts", [])
    if not isinstance(shifts_raw, list):
        raise StateError(f"Profile {label} shifts must be a list.")
    received = _validate_month_map(raw.get("received"), f"{label}.received")
    osobne = _validate_month_map(raw.get("osobne"), f"{label}.osobne")
    vacation = _validate_vacation(raw.get("vacation"))
    imports = raw.get("imports", [])
    if imports is None:
        imports = []
    if not isinstance(imports, list):
        raise StateError(f"Profile {label} imports must be a list.")
    undos = raw.get("import_undos")
    if undos is None and isinstance(raw.get("import_undo"), dict):
        undos = [raw["import_undo"]]
    profile = default_profile()
    profile["settings"] = {**DEFAULT_SETTINGS, **raw["settings"]}
    profile["shifts"] = [_validate_shift_row(s, i) for i, s in enumerate(shifts_raw)]
    profile["received"] = received
    profile["osobne"] = osobne
    profile["vacation"] = vacation
    profile["imports"] = [x for x in imports if isinstance(x, dict)]
    profile["import_undos"] = _validate_undos(undos)
    pending = raw.get("pending_import")
    if isinstance(pending, dict):
        profile["pending_import"] = pending
    return profile


def _is_flat(payload: dict[str, Any]) -> bool:
    return "settings" in payload and "profiles" not in payload


def validate_state(payload: Any) -> dict[str, Any]:
    """Normalize a backup or on-disk document. Raises StateError if unusable."""
    if not isinstance(payload, dict):
        raise StateError("Backup must be a JSON object.")
    if _is_flat(payload):
        bag = _validate_profile(payload, "default")
        active = "default"
        profiles = {"default": bag}
    else:
        if "settings" not in payload and not payload.get("profiles"):
            raise StateError("Backup is missing settings.")
        raw_profiles = payload.get("profiles")
        if not isinstance(raw_profiles, dict) or not raw_profiles:
            raise StateError("Backup is missing profiles.")
        profiles = {}
        for pid, raw in raw_profiles.items():
            if not isinstance(pid, str) or not PROFILE_ID_RE.match(pid):
                raise StateError(f"Invalid profile id {pid!r}.")
            profiles[pid] = _validate_profile(raw, pid)
        active = payload.get("active_profile") or next(iter(profiles))
        if active not in profiles:
            raise StateError(f"active_profile {active!r} is not in profiles.")
    return {
        "active_profile": active,
        "profiles": profiles,
        "updated_at": payload.get("updated_at"),
    }


def active_profile(state: dict[str, Any]) -> dict[str, Any]:
    profiles = state.setdefault("profiles", {})
    pid = state.get("active_profile") or "default"
    if pid not in profiles:
        pid = next(iter(profiles), "default")
        state["active_profile"] = pid
        profiles.setdefault(pid, default_profile())
    return profiles[pid]


def load_state() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        state = default_state()
        save_state(state)
        return state
    with STATE_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    try:
        return validate_state(raw)
    except StateError:
        # Local file from an older build: wrap and merge without failing the app.
        merged = default_state()
        if isinstance(raw, dict) and _is_flat(raw):
            bag = merged["profiles"]["default"]
            bag["settings"] = {**DEFAULT_SETTINGS, **(raw.get("settings") or {})}
            for key in ("shifts", "received", "osobne", "vacation", "imports"):
                if key in raw:
                    bag[key] = raw[key]
            if isinstance(raw.get("import_undos"), list):
                bag["import_undos"] = raw["import_undos"][-UNDO_LIMIT:]
            elif isinstance(raw.get("import_undo"), dict):
                bag["import_undos"] = [raw["import_undo"]]
            if isinstance(raw.get("pending_import"), dict):
                bag["pending_import"] = raw["pending_import"]
        return merged


def save_state(state: dict[str, Any]) -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = datetime.now().isoformat(timespec="seconds")
    tmp = STATE_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    tmp.replace(STATE_PATH)
    return state
