from pathlib import Path

import pytest

from parser import parse_export

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "mcga-hours-sample.xls"


def test_sample_xls_parses_shifts():
    report = parse_export(SAMPLE.read_bytes(), SAMPLE.name)
    assert report["shifts"]
    dates = {s["date"] for s in report["shifts"]}
    assert "2026-02-02" in dates or any(s["date"].startswith("2026-") for s in report["shifts"])


def test_plaintext_is_rejected():
    with pytest.raises(ValueError, match="No HTML table"):
        parse_export("this is not an hours export")


def test_html_without_table_is_rejected():
    with pytest.raises(ValueError, match="No HTML table"):
        parse_export("<html><body><p>Hours</p></body></html>")


def test_table_without_date_headers_is_rejected():
    html = "<table><tr><th>Name</th><th>Hours</th></tr><tr><td>Ada</td><td>8</td></tr></table>"
    with pytest.raises(ValueError, match="No MCGA calendar date headers"):
        parse_export(html)


def test_calendar_headers_without_clock_cells_is_rejected():
    html = """
    <table>
      <tr><th>Who</th><th>Mon, Feb 02</th></tr>
      <tr><td>Ada</td><td></td></tr>
    </table>
    """
    with pytest.raises(ValueError, match="no clock-in/out"):
        parse_export(html, "20260202_export.xls")
