# Sweep native SOL from all D1 custodial wallets (internal_solana_wallets) to one address.
# Requires: Worker deployed with POST /api/internal/sweep-custodial-sol-all
# Secrets on Worker: RR_PUSH_ADMIN_SECRET, RRTT_TREASURY_SECRET_KEY_B58, INTERNAL_WALLET_ENC_KEY_B64, SOLANA_RPC_URL (recommended)
#
# Usage (dry run first):
#   $env:RR_PUSH_ADMIN_SECRET = "..."   # same as X-RR-Push-Admin-Key for other internal routes
#   .\scripts\sweep-custodial-sol.ps1 -Destination "3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ" -DryRun
# Live (default: full native balance; treasury pays fee):
#   .\scripts\sweep-custodial-sol.ps1 -Destination "3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ"
# Legacy: only send balance minus rent-exempt minimum:
#   .\scripts\sweep-custodial-sol.ps1 -Destination "..." -RespectRentFloor

param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string]$ApiBase = "https://api.rootrecord.info",
  [switch]$DryRun,
  [switch]$RespectRentFloor
)

$secret = $env:RR_PUSH_ADMIN_SECRET
if (-not $secret) {
  Write-Error "Set RR_PUSH_ADMIN_SECRET in the environment."
  exit 1
}

$body = @{
  destination          = $Destination
  dry_run              = [bool]$DryRun
  respect_rent_floor   = [bool]$RespectRentFloor
} | ConvertTo-Json -Compress
$uri = "$ApiBase/api/internal/sweep-custodial-sol-all"

Invoke-RestMethod -Uri $uri -Method Post -Headers @{
  "X-RR-Push-Admin-Key" = $secret
  "Content-Type"        = "application/json"
} -Body $body | ConvertTo-Json -Depth 12
