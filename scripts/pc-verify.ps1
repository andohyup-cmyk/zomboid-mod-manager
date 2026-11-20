# Local verification only. Does not deploy, merge or modify databases/game servers.
[CmdletBinding()]
param([switch]$Browser)
$ErrorActionPreference = "Stop"
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (-not (Test-Path -LiteralPath "package.json")) { throw "Cannot locate project package.json" }
  Write-Host "=== Current Git branch and changed files ==="
  git branch --show-current
  git status --short
  if ($LASTEXITCODE -ne 0) { throw "Git status failed" }

  Write-Host "=== Dependencies ==="
  if (Test-Path -LiteralPath "package-lock.json") {
    npm ci --no-audit
  } else {
    Write-Warning "No package-lock.json in the checkout; using npm install. Lockfile pinning remains a follow-up."
    npm install --no-audit
  }
  if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed" }

  Write-Host "=== Tests / TypeScript / ESLint ==="
  npm run verify
  if ($LASTEXITCODE -ne 0) { throw "Verification failed" }

  Write-Host "=== Next.js production build (local only) ==="
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }

  if ($Browser) {
    Write-Host "=== Local browser tests (may require: npx playwright install chromium) ==="
    npm run test:browser
    if ($LASTEXITCODE -ne 0) { throw "Browser tests failed" }
  }
  Write-Host "Local checks passed. No deployment or database/game-server changes were made."
}
finally { Pop-Location }
