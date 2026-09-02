from datetime import date

from holidays import holiday_name, slovak_holidays


def test_easter_2026():
    names = slovak_holidays(2026)
    assert names[date(2026, 4, 3)] == "Veľký piatok"
    assert names[date(2026, 4, 6)] == "Veľkonočný pondelok"
    assert holiday_name(date(2026, 4, 3)) == "Veľký piatok"
    assert holiday_name(date(2026, 4, 5)) is None
