# Deploy all per-app API shards (does NOT deploy rootrecord-primary).
# Run from Web/cloudflare:  powershell -NoProfile -ExecutionPolicy Bypass -File ./deploy-api-shards.ps1
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$shards = @(
  "rootrecord-api-weather",
  "rootrecord-api-business",
  "rootrecord-api-account",
  "rootrecord-api-token",
  "rootrecord-api-kilauea"
)
foreach ($name in $shards) {
  $dir = Join-Path $here $name
  if (-not (Test-Path -LiteralPath $dir)) {
    throw "Missing directory: $dir"
  }
  Write-Host "`n========== $name ==========" -ForegroundColor Cyan
  Push-Location $dir
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $dir "node_modules"))) {
      npm ci
    }
    powershell -NoProfile -ExecutionPolicy Bypass -File ./deploy.ps1 @args
  }
  finally {
    Pop-Location
  }
}
Write-Host "`nAll API shards deployed." -ForegroundColor Green
