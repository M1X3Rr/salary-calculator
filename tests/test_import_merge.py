from app import diff_import, merge_import


def _shift(day, start="08:00", end="16:00", reported_hours=None, extra=None):
    row = {"date": day, "start": start, "end": end, "reported_hours": reported_hours}
    if extra:
        row.update(extra)
    return row


def test_new_dates_are_added():
    existing = [_shift("2026-01-05")]
    incoming = [_shift("2026-01-06")]
    diff = diff_import(existing, incoming)
    assert diff["new_dates"] == ["2026-01-06"]
    assert diff["same_dates"] == []
    assert diff["conflicts"] == []
    merged = merge_import(existing, incoming, set())
    assert {s["date"] for s in merged} == {"2026-01-05", "2026-01-06"}


def test_identical_dates_stay_stored():
    stored = _shift("2026-01-05", extra={"note": "stored"})
    incoming = _shift("2026-01-05", extra={"note": "file"})
    diff = diff_import([stored], [incoming])
    assert diff["same_dates"] == ["2026-01-05"]
    merged = merge_import([stored], [incoming], set())
    assert merged == [stored]


def test_conflict_empty_overwrite_keeps_stored():
    stored = _shift("2026-01-05", "08:00", "12:00")
    incoming = _shift("2026-01-05", "09:00", "17:00")
    diff = diff_import([stored], [incoming])
    assert [c["date"] for c in diff["conflicts"]] == ["2026-01-05"]
    merged = merge_import([stored], [incoming], set())
    assert merged == [stored]


def test_conflict_overwrite_uses_incoming():
    stored = _shift("2026-01-05", "08:00", "12:00")
    incoming = _shift("2026-01-05", "09:00", "17:00")
    merged = merge_import([stored], [incoming], {"2026-01-05"})
    assert merged == [incoming]


def test_stored_only_dates_stay():
    kept = _shift("2026-01-04")
    stored = _shift("2026-01-05", "08:00", "12:00")
    incoming = _shift("2026-01-05", "09:00", "17:00")
    merged = merge_import([kept, stored], [incoming], {"2026-01-05"})
    dates = [s["date"] for s in merged]
    assert dates == ["2026-01-04", "2026-01-05"]
    assert merged[0] == kept
    assert merged[1] == incoming
