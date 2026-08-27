# MCGA Salary Calculator

Local dashboard for Slovak 2026 payroll. Import an MCGA hours export (HTML saved as `.xls`), see brutto/netto by month, and save the amount you actually received.

Nothing leaves this machine. The API binds to `127.0.0.1`.

## Run

From this folder, in two terminals:

**Backend**

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

**Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Or from the project root:

```powershell
.\start.ps1
```

## Import

Use **Import hours** and drop a file like `20260826_….xls` (calendar with `8h 5m` and `07:54 - 16:00` cells). Overnight shifts (`23:12 - 01:20`) are counted correctly. Dates already in the file replace those days; other months stay.

## Received vs calculated

On Overview, type **Received** for a month and click **Save**. Difference is received minus calculated čistá mzda. Values are stored in `data/state.json`.

## Rates

Defaults match 2026 Slovak employment (pracovný pomer): 8 €/h, employee social 9.4% + health 5%, NČZD 497.23 €, 19% tax, weekend/night príplatky vs minimum hourly wage 5.259 €. Change them under **Settings**.
