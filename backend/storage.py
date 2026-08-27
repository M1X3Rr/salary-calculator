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
    "personal_no": "Z0291",
    "employer": "MCGA legal",
    "health_insurer": "Union",
    "hourly_rate": 8.0,
    "avg_earnings": 0.0,
    "apply_nczd": True,
    "contract_h_week": 20,
    "rate_np": 0.014,
    "rate_sp": 0.04,
    "rate_ip": 0.03,
    "rate_pvn": 0.01,
    "rate_zp": 0.05,
    "nczd": 497.23,
    "tax19": 0.19,
    "tax25": 0.25,
    "bracket19": 3665.28,
    "prem_sat": 2.6295,
    "prem_sun": 5.259,
    "prem_night": 2.1036,
    "prem_hol_pct": 1.0,
    "prem_ot_pct": 0.25,
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
