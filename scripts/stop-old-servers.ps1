$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(4173, 4174) }

foreach ($processId in ($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
  $commandLine = [string]$process.CommandLine
  $belongsToThisApp = $process.Name -eq 'node.exe' -and
    $commandLine.IndexOf($workspace, [StringComparison]::OrdinalIgnoreCase) -ge 0

  if (-not $belongsToThisApp) {
    Write-Host "Port 4173 or 4174 is used by another program (PID $processId). It was left untouched." -ForegroundColor Yellow
    exit 2
  }

  Write-Host "Stopping an old Quick Vocab server (PID $processId)..." -ForegroundColor Yellow
  Stop-Process -Id $processId -Force
}

if ($listeners) { Start-Sleep -Milliseconds 500 }
