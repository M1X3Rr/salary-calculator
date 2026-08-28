"""Local JSON persistence for settings, shifts, and received amounts."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STATE_PATH = DATA_DIR / "state.json"

DEFAULT_SETTINGS: dict[str, Any] = {
    "name": "Michal Fesenko",
    "department": "",
    "personal_no": "Z0291",
    "employer": "MCGA legal",
    "health_insurer": "Union",
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


def default_state() -> dict[str, Any]:
    return {
        "settings": deepcopy(DEFAULT_SETTINGS),
        "shifts": [],
        "received": {},
        "osobne": {},
        "vacation": {},
        "imports": [],
        "updated_at": None,
    }


def load_state() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        state = default_state()
        save_state(state)
        return state
    with STATE_PATH.open(encoding="utf-8") as f:
        state = json.load(f)
    merged = default_state()
    merged.update({k: v for k, v in state.items() if k != "settings"})
    merged["settings"] = {**DEFAULT_SETTINGS, **state.get("settings", {})}
    merged.setdefault("shifts", [])
    merged.setdefault("received", {})
    merged.setdefault("osobne", {})
    merged.setdefault("vacation", {})
    merged.setdefault("imports", [])
    return merged


def save_state(state: dict[str, Any]) -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = datetime.now().isoformat(timespec="seconds")
    tmp = STATE_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    tmp.replace(STATE_PATH)
    return state
