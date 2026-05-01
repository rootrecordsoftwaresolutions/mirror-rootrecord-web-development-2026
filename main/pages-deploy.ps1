# Deploy Cloudflare Pages — loads credentials like Worker deploy.ps1, but merges multiple
# env files walking up from this folder (e.g. Web/credentials.env then ../credentials.env.txt).
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Import-DotEnvFile([string]$LiteralPath) {
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
  Get-Content -LiteralPath $LiteralPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $p = $line.IndexOf("=")
    if ($p -gt 0) {
      $k = $line.Substring(0, $p).Trim()
      $v = $line.Substring($p + 1).Trim()
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

$dirs = @()
$probe = $PSScriptRoot
for ($i = 0; $i -le 16; $i++) {
  $dirs += $probe
  $parent = Split-Path $probe -Parent
  if (-not $parent -or $parent -eq $probe) { break }
  $probe = $parent
}

$files = @()
foreach ($d in $dirs) {
  foreach ($name in @("credentials.env.txt", "credentials.env")) {
    $full = Join-Path $d $name
    if (Test-Path -LiteralPath $full) { $files += $full }
  }
}

if ($files.Count -eq 0) {
  throw "No credentials.env or credentials.env.txt found walking up from $PSScriptRoot."
}

foreach ($f in $files) {
  Import-DotEnvFile $f
}

if ($env:CLOUDFLARE_GLOBAL_API_KEY -and -not $env:CLOUDFLARE_API_KEY) {
  Set-Item -Path "Env:CLOUDFLARE_API_KEY" -Value $env:CLOUDFLARE_GLOBAL_API_KEY
}

$hasToken = $env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_API_TOKEN.Length -ge 10
$hasGlobal = $env:CLOUDFLARE_API_KEY -and $env:CLOUDFLARE_API_KEY.Length -ge 10 -and $env:CLOUDFLARE_EMAIL -and $env:CLOUDFLARE_EMAIL.Length -gt 3
if (-not $hasToken -and -not $hasGlobal) {
  throw "Set CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_KEY in a credentials file (merged from: $($files -join ', '))."
}

Set-Location $PSScriptRoot
npx wrangler pages deploy . --project-name=rootrecord-website @args
