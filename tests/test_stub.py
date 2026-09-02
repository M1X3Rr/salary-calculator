from stub import reconcile_month, stub_incomplete


def test_reconcile_delta_is_stub_minus_calc_two_dp():
    payroll = {"basic": 100.0, "cista": 80.0}
    stub = {"zakladna": 110.11, "cista": 80.0}
    recon = reconcile_month(payroll, stub)
    row = next(r for r in recon["rows"] if r["label"] == "Základná mzda")
    assert row["calc"] == 100.0
    assert row["stub"] == 110.11
    assert row["delta"] == 10.11
    assert recon["unexplained"] == 0.0


def test_received_without_detail_lines_is_incomplete():
    entry = {"amount": 500.0, "stub": {"cista": 500.0}}
    assert stub_incomplete(entry, 500.0) is True


def test_one_detail_money_field_is_complete():
    entry = {"amount": 500.0, "stub": {"cista": 500.0, "hruba": 620.0}}
    assert stub_incomplete(entry, 500.0) is False
    assert stub_incomplete(entry, None) is False
