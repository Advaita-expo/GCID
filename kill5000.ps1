$p=(Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue).OwningProcess
if ($p) { Stop-Process -Id $p -Force; Write-Output "Killed $p" } else { Write-Output "No process on port 5000" }