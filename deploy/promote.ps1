# RailGaadi — promote code between branches
#   dev -> staging -> production (live)
#
#   powershell -File deploy\promote.ps1            # dev -> staging (test)
#   powershell -File deploy\promote.ps1 -Prod      # staging -> production (live)
#   powershell -File deploy\promote.ps1 -All       # dev -> staging -> production
#   powershell -File deploy\promote.ps1 -Status    # where each branch is

param(
    [switch]$Prod,
    [switch]$All,
    [switch]$Status
)

function Show-Status {
    Write-Output "Branches (remote):"
    git fetch origin
    foreach ($b in @('dev', 'staging', 'production')) {
        $local = git rev-parse --short "$b" 2>$null
        $remote = git rev-parse --short "origin/$b" 2>$null
        Write-Output ("  {0,-8} local={1}  remote={2}  {3}" -f $b, $local, $remote, $(if ($local -eq $remote) { "IN SYNC" } else { "DIFFERS" }))
    }
}

if ($Status) { Show-Status; exit 0 }

function Promote($from, $to) {
    Write-Output ">>> Promoting $from -> $to"
    git checkout $to
    git pull origin $to
    git merge $from -m "Promote $from -> $to"
    git push origin $to
    git checkout $from
    Write-Output "<<< $from -> $to done"
}

if ($All) {
    Promote 'dev' 'staging'
    Promote 'staging' 'production'
} elseif ($Prod) {
    Promote 'staging' 'production'
} else {
    Promote 'dev' 'staging'
}

Show-Status
