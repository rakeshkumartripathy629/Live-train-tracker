# RailGaadi — generate deploy/.env.production (or .env.staging) from your local
# dev env files (backend/.env + frontend/.env.local). Run on Windows:
#   powershell -File deploy\generate-prod-env.ps1            # production
#   powershell -File deploy\generate-prod-env.ps1 -Staging   # staging
# The generated file contains real secrets — it is gitignored. Upload it to the
# EC2 server as `.env` (repo root). Never commit or share it.

param(
    [switch]$Staging
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backendEnv = Join-Path $root 'backend\.env'
$frontendEnv = Join-Path $root 'frontend\.env.local'
$out = if ($Staging) { Join-Path $PSScriptRoot '.env.staging' } else { Join-Path $PSScriptRoot '.env.production' }
$label = if ($Staging) { 'staging' } else { 'production' }
$placeholder = if ($Staging) { 'staging.CHANGE_ME' } else { 'CHANGE_ME' }

function Read-Env($path) {
    $map = @{}
    if (-not (Test-Path $path)) { throw "Missing: $path" }
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $idx = $line.IndexOf('=')
            if ($idx -gt 0) {
                $k = $line.Substring(0, $idx).Trim()
                $v = $line.Substring($idx + 1).Trim()
                if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
                if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
                $map[$k] = $v
            }
        }
    }
    return $map
}

$be = Read-Env $backendEnv
$fe = Read-Env $frontendEnv

$lines = @(
    "# RailGaadi $label env - generated from backend/.env + frontend/.env.local",
    'PUBLIC_IP=CHANGE_ME',
    "NEXTAUTH_URL=http://$placeholder",
    "NEXT_PUBLIC_API_URL=http://$placeholder/api/v1",
    "CORS_ORIGINS=http://$placeholder",
    '',
    "MONGODB_URI=$($be['MONGODB_URI'])",
    "RAILRADAR_API_KEY=$($be['RAILRADAR_API_KEY'])",
    "UPSTASH_REDIS_REST_URL=$($be['UPSTASH_REDIS_REST_URL'])",
    "UPSTASH_REDIS_REST_TOKEN=$($be['UPSTASH_REDIS_REST_TOKEN'])",
    "VAPID_PUBLIC_KEY=$($be['VAPID_PUBLIC_KEY'])",
    "VAPID_PRIVATE_KEY=$($be['VAPID_PRIVATE_KEY'])",
    "VAPID_SUBJECT=$($be['VAPID_SUBJECT'])",
    "OPENWEATHER_API_KEY=$($fe['OPENWEATHER_API_KEY'])",
    "OPENTOPOGRAPHY_API_KEY=$($fe['OPENTOPOGRAPHY_API_KEY'])",
    "NEXT_PUBLIC_MAPTILER_API_KEY=$($fe['NEXT_PUBLIC_MAPTILER_API_KEY'])",
    "NEXTAUTH_SECRET=$($fe['NEXTAUTH_SECRET'])",
    "INTERNAL_API_TOKEN=$($be['INTERNAL_API_TOKEN'])",
    ''
)

Set-Content -Path $out -Value $lines -Encoding ASCII
Write-Output "Wrote $out"
Write-Output "Now edit PUBLIC_IP in $out (or run setup.sh on the server which does it for you)."
