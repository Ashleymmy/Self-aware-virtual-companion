param(
  [switch]$NoStatus
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

Write-Host "=== SAVC Stop Launcher ===" -ForegroundColor Cyan

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Host "[INFO] Repo root: $RepoRoot" -ForegroundColor Gray

if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] WSL not found. Please install WSL first." -ForegroundColor Red
  exit 1
}

function Convert-ToLinuxPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath
  )

  $normalized = $InputPath -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', ''
  if ($normalized -match '^\\\\wsl(?:\.localhost)?\\[^\\]+\\(.+)$') {
    $tail = $Matches[1] -replace '\\', '/'
    if ($tail.StartsWith('/')) {
      return $tail
    }
    return "/$tail"
  }

  return (wsl wslpath -a "$normalized" 2>$null).Trim()
}

$LinuxRoot = Convert-ToLinuxPath -InputPath $RepoRoot
if (-not $LinuxRoot) {
  Write-Host "[ERROR] Failed to resolve Linux path via wslpath." -ForegroundColor Red
  exit 1
}
$LinuxRootEscaped = $LinuxRoot.Replace("'", "'""'""'")

function Invoke-RepoBash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $fullCommand = "cd '$LinuxRootEscaped' && $Command"
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    $output = & wsl -e bash -lc $fullCommand 2>&1
  } finally {
    $ErrorActionPreference = $prevErrorAction
  }
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output   = @($output)
  }
}

Write-Host "[INFO] Stopping gateway service in WSL..." -ForegroundColor Yellow
$stop = Invoke-RepoBash -Command "bash scripts/openclaw.sh gateway stop"
if ($stop.Output.Count -gt 0) {
  $stop.Output | ForEach-Object { Write-Host $_ }
}
if ($stop.ExitCode -ne 0) {
  Write-Host "[ERROR] Gateway stop failed. Exit code: $($stop.ExitCode)" -ForegroundColor Red
  exit $stop.ExitCode
}

Write-Host "[INFO] Stopping savc-ui service in WSL..." -ForegroundColor Yellow
$uiStop = Invoke-RepoBash -Command "bash scripts/savc_ui_service.sh stop"
if ($uiStop.Output.Count -gt 0) {
  $uiStop.Output | ForEach-Object { Write-Host $_ }
}
if ($uiStop.ExitCode -ne 0) {
  Write-Host "[WARN] savc-ui stop returned non-zero. Exit code: $($uiStop.ExitCode)" -ForegroundColor Yellow
}

if (-not $NoStatus) {
  $status = Invoke-RepoBash -Command "bash scripts/openclaw.sh gateway status"
  if ($status.Output.Count -gt 0) {
    $status.Output | ForEach-Object { Write-Host $_ }
  }
  if ($status.ExitCode -ne 0) {
    Write-Host "[WARN] gateway status returned non-zero after stop (expected when probe fails on stopped service)." -ForegroundColor Yellow
  }
}

Write-Host "[OK] SAVC stop complete." -ForegroundColor Green
