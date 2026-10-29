# Update-SessionMap.ps1
# Pulls the latest session map branch, reinstalls, rebuilds and starts the dashboard.
# Lives in the repo root, so it runs from wherever the repo is cloned.
#
# Run from PowerShell in the repo folder:
#   powershell -ExecutionPolicy Bypass -File .\Update-SessionMap.ps1
#   powershell -ExecutionPolicy Bypass -File .\Update-SessionMap.ps1 -SkipTests

param(
    [string]$RepoPath = $PSScriptRoot,
    [string]$Branch = 'feature/session-map-phase1',
    [int]$Port = 3000,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param(
        [string]$Description,
        [scriptblock]$Command
    )
    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code $LASTEXITCODE)."
    }
}

if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
    throw "No git repository at '$RepoPath'. Run this script from the root of a holdmysession clone."
}

Set-Location $RepoPath

Invoke-Checked "Fetching from origin" { git fetch origin }
Invoke-Checked "Switching to $Branch" { git checkout $Branch }
Invoke-Checked "Pulling latest $Branch" { git pull --ff-only origin $Branch }

Set-Location (Join-Path $RepoPath 'apps\web')

Invoke-Checked "Installing dependencies" { npm ci }
Invoke-Checked "Typecheck" { npm run typecheck }
if (-not $SkipTests) {
    Invoke-Checked "Running tests" { npx vitest run }
}
Invoke-Checked "Building" { npm run build }

$url = "http://localhost:$Port/map"
Write-Host "==> Starting dashboard at $url (Ctrl+C to stop)" -ForegroundColor Green

# Open the Map page once the server has had a moment to start.
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 4
    Start-Process $u
} -ArgumentList $url | Out-Null

npm start -- --port $Port
