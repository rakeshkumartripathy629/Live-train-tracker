param(
    [switch]$Stop,
    [switch]$Status
)

$exe = "$env:USERPROFILE\cloudflared\cloudflared.exe"
$log = "$env:USERPROFILE\cloudflared\tunnel.log"
$procName = "cloudflared"

function Get-TunnelUrl {
    if (-not (Test-Path $log)) { return $null }
    $m = [regex]::Matches((Get-Content $log -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Count -eq 0) { return $null }
    return $m[$m.Count - 1].Value
}

if ($Stop) {
    $p = Get-Process $procName -ErrorAction SilentlyContinue
    if ($p) { $p | Stop-Process -Force; Write-Output "Tunnel stopped." } else { Write-Output "No tunnel running." }
    exit 0
}

if ($Status) {
    if (Get-Process $procName -ErrorAction SilentlyContinue) {
        $url = Get-TunnelUrl
        if ($url) { Write-Output "Tunnel RUNNING: $url" } else { Write-Output "Tunnel starting (no URL yet)..." }
    } else {
        Write-Output "Tunnel NOT running."
    }
    exit 0
}

if (Get-Process $procName -ErrorAction SilentlyContinue) {
    $url = Get-TunnelUrl
    Write-Output ("Tunnel already running: " + $url)
    exit 0
}

if (-not (Test-Path $exe)) {
    Write-Error "cloudflared not found at $exe. Download first:"
    Write-Output "  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '$exe'"
    exit 1
}

Start-Process -FilePath $exe -ArgumentList "tunnel --url http://localhost:80 --no-autoupdate --logfile $log --loglevel info" -WindowStyle Hidden
Write-Output "Starting tunnel..."

$url = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    $url = Get-TunnelUrl
    if ($url) { break }
}
if ($url) {
    Write-Output "LIVE: $url"
    Start-Process $url
} else {
    Write-Error "Tunnel started but no URL yet. Check $log"
}
