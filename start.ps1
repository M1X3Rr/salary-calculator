$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

python -m pip install -r "$root\backend\requirements.txt" -q
npm --prefix "$root\frontend" install

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\backend'; python -m uvicorn app:app --host 127.0.0.1 --port 8000"
)
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:5173"
Write-Output "Backend http://127.0.0.1:8000  |  UI http://127.0.0.1:5173"
