# Friday - one-command setup + launch for Windows.
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File .\install.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node 18+ is required. Install it from https://nodejs.org and re-run."
  exit 1
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 18) {
  Write-Host "Node 18+ is required (found $(node -v))."
  exit 1
}

Write-Host "Installing Friday (one-time)..."
npm run setup

Write-Host ""
Write-Host "Starting Friday -> http://localhost:5173  (backend on :8787; Ctrl-C to stop)"
npm run dev
