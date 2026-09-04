# Salary Calculator

Local dashboard for Slovak 2026 payroll. Import an hours export (HTML saved as `.xls`), see brutto/netto by month, and save the amount you actually received.

Nothing leaves this machine. The API binds to `127.0.0.1`.

## Run

From this folder, in two terminals:

**Backend**

```
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

**Frontend**

```
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Or from the project root:

```powershell
.\start.ps1
```

```bash
chmod +x start.sh
./start.sh
```

## Tests

```
python -m pip install -r backend/requirements.txt
python -m pytest tests -q
```



## Import

Use **Import hours** and drop a file like `20260826_….xls` (calendar with `8h 5m` and `07:54 - 16:00` cells). Overnight shifts (`23:12 - 01:20`) are counted correctly. Dates already in the file replace those days; other months stay.

## Received vs calculated

On Overview, type **Received** for a month and click **Save**. Difference is received minus calculated čistá mzda. Values are stored in `data/state.json`.

## Rates

Statutory 2026 amounts (NČZD, tax brackets, príplatky, min wage, employer %) live in `STATUTORY_BY_YEAR`. Each month uses that calendar year’s table; years without a table use the live Settings overlay (today’s 2026 numbers). Identity and contract fields (`hourly_rate`, dohoda type, OOP, weekly hours) always come from Settings.

On a študentská dohoda, **základná mzda** is 4 h × weekdays in the month (20 h/week). Hours above that cap are **osobné ohodnotenie** at the hourly rate, not a 25% overtime príplatok. Paste the employer’s osobné from the stub to override that auto amount.