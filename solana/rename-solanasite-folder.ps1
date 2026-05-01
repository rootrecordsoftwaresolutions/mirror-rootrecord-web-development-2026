# Rename Web/solana/solanasite -> Web/solana/solana-rootrecord-site (match canonical GitHub repo name).
# Run from Web/solana/. Close pnpm dev, terminals, and IDE handles on that folder first (Windows file locks).
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$old = Join-Path $here "solanasite"
$new = Join-Path $here "solana-rootrecord-site"
if (-not (Test-Path -LiteralPath $old)) {
    if (Test-Path -LiteralPath $new) {
        Write-Host "Already renamed: $new exists."
        exit 0
    }
    throw "Neither '$old' nor '$new' exists. Expected the Next app under Web/solana/."
}
if (Test-Path -LiteralPath $new) {
    throw "Target already exists: $new — remove or rename it, then retry."
}
Write-Host "Renaming:`n  $old`n  ->`n  $new"
Rename-Item -LiteralPath $old -NewName "solana-rootrecord-site"
Write-Host "Done. From Web repo root: git add -A && git status (expect rename)."
