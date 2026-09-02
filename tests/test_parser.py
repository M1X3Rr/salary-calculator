from pathlib import Path

from parser import parse_export

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "mcga-hours-sample.xls"


def test_sample_xls_parses_shifts():
    report = parse_export(SAMPLE.read_bytes(), SAMPLE.name)
    assert report["shifts"]
    dates = {s["date"] for s in report["shifts"]}
    assert "2026-02-02" in dates or any(s["date"].startswith("2026-") for s in report["shifts"])
