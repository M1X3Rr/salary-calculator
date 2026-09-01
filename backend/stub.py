"""Official payslip stub fields vs calculated payroll."""

from __future__ import annotations

from typing import Any

STUB_MONEY_KEYS = [
    "zakladna",
    "dovolenka",
    "osobne",
    "sviatky",
    "premie",
    "noc",
    "sobota",
    "nedela",
    "platene_volno",
    "premie_dlhsie",
    "hruba",
    "np",
    "sp",
    "ip",
    "pvn",
    "zp",
    "nczd",
    "dan",
    "danovy_bonus",
    "cista",
    "nahrada_prijmu",
    "nezdane_nahrady",
    "vyuctovanie",
    "er_np",
    "er_sp",
    "er_ip",
    "er_pvn",
    "er_pfp",
    "er_up",
    "er_gp",
    "er_prfs",
    "er_zp",
    "employer_cost",
]

STUB_QTY_KEYS = [
    "dovolenka_days",
    "sviatky_days",
    "noc_hours",
    "sobota_hours",
    "nedela_hours",
    "platene_volno_days",
]

# Čistá / vyúčtovanie count as the received amount, not as "details".
RECEIVED_STUB_KEYS = ("cista", "vyuctovanie")
DETAIL_MONEY_KEYS = [k for k in STUB_MONEY_KEYS if k not in RECEIVED_STUB_KEYS]

RECONCILE_ROWS = [
    ("Základná mzda", "basic", "zakladna"),
    ("Osobné ohodnotenie", "osobne", "osobne"),
    ("Príplatok sobota", "sat_prem", "sobota"),
    ("Príplatok nedeľa", "sun_prem", "nedela"),
    ("Práca v noci", "night_prem", "noc"),
    ("Príplatok sviatok", "holiday_prem", "sviatky"),
    ("Príplatok nadčas", "ot_prem", None),
    ("Hrubá mzda", "hruba", "hruba"),
    ("Nemocenské (NP)", "np", "np"),
    ("Starobné (SP)", "sp", "sp"),
    ("Invalidné (IP)", "ip", "ip"),
    ("Poist. v nezam. (PvN)", "pvn", "pvn"),
    ("Zdravotné (ZP)", "zp", "zp"),
    ("Nezdaniteľná časť", "nczd_applied", "nczd"),
    ("Daň", "dan", "dan"),
    ("Čistá mzda", "cista", "cista"),
    ("Celková cena práce", "employer_cost", "employer_cost"),
]

STUB_ONLY_ROWS = [
    ("Dovolenka", "dovolenka", "dovolenka_days"),
    ("Sviatky (days on stub)", "sviatky", "sviatky_days"),
    ("Prémie", "premie", None),
    ("Prémie za dlhšie obdobie", "premie_dlhsie", None),
    ("Platené voľno", "platene_volno", "platene_volno_days"),
    ("Daňový bonus - deti", "danovy_bonus", None),
    ("Náhrada príjmu", "nahrada_prijmu", None),
    ("Nezdaniteľné náhrady", "nezdane_nahrady", None),
    ("Vyúčtovanie", "vyuctovanie", None),
    ("Poistné zamestnávateľa NP", "er_np", None),
    ("Poistné zamestnávateľa SP", "er_sp", None),
    ("Poistné zamestnávateľa IP", "er_ip", None),
    ("Poistné zamestnávateľa PvN", "er_pvn", None),
    ("Poistné zamestnávateľa PFP", "er_pfp", None),
    ("Poistné zamestnávateľa UP", "er_up", None),
    ("Poistné zamestnávateľa GP", "er_gp", None),
    ("Poistné zamestnávateľa PRFS", "er_prfs", None),
    ("Poistné zamestnávateľa ZP", "er_zp", None),
]


def empty_stub() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in STUB_MONEY_KEYS + STUB_QTY_KEYS:
        out[key] = None
    return out


def _num(value: Any) -> float | None:
    if value in (None, "", False):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n == 0:
        return 0.0
    return n


def normalize_stub(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    out = empty_stub()
    for key in STUB_MONEY_KEYS + STUB_QTY_KEYS:
        if key in src:
            out[key] = _num(src[key])
    return out


def stub_has_values(stub: dict[str, Any] | None) -> bool:
    if not stub:
        return False
    return any(v not in (None, 0, 0.0) for v in stub.values())


def compact_stub(stub: dict[str, Any] | None) -> dict[str, Any] | None:
    norm = normalize_stub(stub)
    kept = {k: v for k, v in norm.items() if v not in (None,)}
    return kept or None


def _nonzero(value: Any) -> bool:
    n = _num(value)
    return n is not None and n != 0


def received_from_entry(entry: Any) -> float | None:
    if not isinstance(entry, dict):
        return _num(entry) if entry not in (0, 0.0) else None
    stub = normalize_stub(entry.get("stub"))
    for key in ("vyuctovanie", "cista"):
        n = _num(stub.get(key))
        if n not in (None, 0.0):
            return n
    amount = entry.get("amount")
    n = _num(amount)
    if n in (None, 0.0):
        return None
    return n


def stub_incomplete(entry: Any, received: float | None) -> bool:
    if received is None:
        return False
    if not isinstance(entry, dict):
        return True
    stub = normalize_stub(entry.get("stub"))
    if any(_nonzero(stub.get(k)) for k in DETAIL_MONEY_KEYS):
        return False
    return True


def reconcile_month(payroll: dict[str, Any], stub: dict[str, Any] | None) -> dict[str, Any]:
    stub_n = normalize_stub(stub)
    rows = []
    for label, calc_key, stub_key in RECONCILE_ROWS:
        calc = _num(payroll.get(calc_key)) if calc_key else None
        stub_v = _num(stub_n.get(stub_key)) if stub_key else None
        delta = None
        if calc is not None and stub_v is not None:
            delta = round(stub_v - calc, 2)
        rows.append({"label": label, "calc": calc, "stub": stub_v, "delta": delta, "mapped": stub_key is not None})
    extras = []
    for label, stub_key, qty_key in STUB_ONLY_ROWS:
        stub_v = _num(stub_n.get(stub_key))
        qty = _num(stub_n.get(qty_key)) if qty_key else None
        if stub_v is None and qty is None:
            continue
        extras.append({"label": label, "stub": stub_v, "qty": qty})
    return {"rows": rows, "extras": extras}


def explain_month(payroll: dict[str, Any], stub: dict[str, Any] | None, incomplete: bool) -> list[str]:
    notes: list[str] = []
    if incomplete:
        notes.append("Only the received (čistá) amount is filled in. Add the rest of the payslip lines to compare against the calculation.")
    stub_n = normalize_stub(stub)
    if not stub_has_values(stub_n) and not incomplete:
        return notes
    stub_osobne = _num(stub_n.get("osobne")) or 0.0
    calc_osobne = _num(payroll.get("osobne")) or 0.0
    stub_prems = sum(_num(stub_n.get(k)) or 0.0 for k in ("noc", "sobota", "nedela", "sviatky"))
    calc_extra = (payroll.get("ot_prem") or 0) + (payroll.get("night_prem") or 0) + (payroll.get("sat_prem") or 0) + (payroll.get("sun_prem") or 0)
    if stub_osobne > calc_osobne + 20 and stub_prems < 0.05 and calc_extra > 0.05:
        notes.append(
            "Stub osobné is much higher than calculated osobné, and stub príplatky are ~0 while the calc has night/OT. Extra hours were likely booked as osobné on the stub — keep calculated osobné at 0 so it is not double-counted."
        )
    recon = reconcile_month(payroll, stub_n)
    for row in recon["rows"]:
        if row["delta"] is None:
            continue
        if abs(row["delta"]) < 0.05:
            continue
        notes.append(
            f"{row['label']}: calc {row['calc']:.2f} € vs stub {row['stub']:.2f} € ({row['delta']:+.2f} €)."
        )
    return notes
