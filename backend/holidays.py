"""Slovak public holidays."""

from __future__ import annotations

from datetime import date, timedelta


def easter_gregorian(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = ((h + l_ - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def slovak_holidays(year: int) -> dict[date, str]:
    eas = easter_gregorian(year)
    items = [
        (date(year, 1, 1), "Deň vzniku Slovenskej republiky"),
        (date(year, 1, 6), "Traja králi"),
        (eas - timedelta(days=2), "Veľký piatok"),
        (eas + timedelta(days=1), "Veľkonočný pondelok"),
        (date(year, 5, 1), "Sviatok práce"),
        (date(year, 5, 8), "Deň víťazstva nad fašizmom"),
        (date(year, 7, 5), "Sviatok sv. Cyrila a Metoda"),
        (date(year, 8, 29), "Výročie SNP"),
        (date(year, 9, 1), "Deň Ústavy SR"),
        (date(year, 9, 15), "Sedembolestná Panna Mária"),
        (date(year, 11, 1), "Sviatok všetkých svätých"),
        (date(year, 11, 17), "Deň boja za slobodu a demokraciu"),
        (date(year, 12, 24), "Štedrý deň"),
        (date(year, 12, 25), "Prvý sviatok vianočný"),
        (date(year, 12, 26), "Druhý sviatok vianočný"),
    ]
    return dict(items)


def holiday_name(day: date) -> str | None:
    return slovak_holidays(day.year).get(day)


def holidays_in_month(year: int, month: int) -> list[dict[str, str]]:
    return [
        {"date": d.isoformat(), "name": name}
        for d, name in slovak_holidays(year).items()
        if d.month == month
    ]
