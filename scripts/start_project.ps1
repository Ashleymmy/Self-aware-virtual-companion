param(
  [switch]$DevMode,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

Write-Host "=== SAVC One-Click Launcher ===" -ForegroundColor Cyan

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
    [string]$Command,
    [switch]$Quiet
  )

  $fullCommand = "cd '$LinuxRootEscaped' && $Command"
  if ($Quiet) {
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
      & wsl -e bash -lc $fullCommand 1>$null 2>$null
    } finally {
      $ErrorActionPreference = $prevErrorAction
    }
    return [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output   = @()
    }
  }

  $output = & wsl -e bash -lc $fullCommand 2>&1
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output   = @($output)
  }
}

if ($DevMode) {
  Write-Host "[INFO] Starting full dev mode in WSL..." -ForegroundColor Yellow
  wsl -e bash -lc "cd '$LinuxRootEscaped' && bash scripts/dev.sh"
  exit $LASTEXITCODE
}

Write-Host "[INFO] Starting gateway service in WSL..." -ForegroundColor Yellow

$restart = Invoke-RepoBash -Command "bash scripts/openclaw.sh gateway restart"
if ($restart.Output.Count -gt 0) {
  $restart.Output | ForEach-Object { Write-Host $_ }
}
if ($restart.ExitCode -ne 0) {
  Write-Host "[ERROR] Gateway restart failed. Exit code: $($restart.ExitCode)" -ForegroundColor Red
  exit $restart.ExitCode
}

$ready = $false
for ($i = 1; $i -le 20; $i++) {
  $health = Invoke-RepoBash -Command "bash scripts/openclaw.sh health" -Quiet
  if ($health.ExitCode -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Write-Host "[ERROR] Gateway did not become healthy within 20s." -ForegroundColor Red
  exit 1
}

Write-Host "[INFO] Starting savc-ui service in WSL..." -ForegroundColor Yellow
$uiStart = Invoke-RepoBash -Command "bash scripts/savc_ui_service.sh start"
if ($uiStart.Output.Count -gt 0) {
  $uiStart.Output | ForEach-Object { Write-Host $_ }
}
if ($uiStart.ExitCode -ne 0) {
  Write-Host "[ERROR] savc-ui start failed. Exit code: $($uiStart.ExitCode)" -ForegroundColor Red
  exit $uiStart.ExitCode
}

$status = Invoke-RepoBash -Command "bash scripts/openclaw.sh channels status --probe"
if ($status.Output.Count -gt 0) {
  $status.Output | ForEach-Object { Write-Host $_ }
}
if ($status.ExitCode -ne 0) {
  Write-Host "[ERROR] Channel probe failed. Exit code: $($status.ExitCode)" -ForegroundColor Red
  exit $status.ExitCode
}

$dashboard = Invoke-RepoBash -Command "bash scripts/openclaw.sh dashboard --no-open"
$OutputLines = @()
if ($dashboard.Output.Count -gt 0) {
  $OutputLines = $dashboard.Output
  $OutputLines | ForEach-Object { Write-Host $_ }
}
if ($dashboard.ExitCode -ne 0) {
  Write-Host "[ERROR] Dashboard URL fetch failed. Exit code: $($dashboard.ExitCode)" -ForegroundColor Red
  exit $dashboard.ExitCode
}

$DashboardUrl = $null
foreach ($line in $OutputLines) {
  if ($line -match "^Dashboard URL:\s*(\S+)$") {
    $DashboardUrl = $Matches[1]
    break
  }
}

if ($DashboardUrl -and -not $NoBrowser) {
  Write-Host "[INFO] Opening dashboard: $DashboardUrl" -ForegroundColor Green
  Start-Process $DashboardUrl | Out-Null
} elseif (-not $DashboardUrl) {
  Write-Host "[WARN] Dashboard URL not found in command output." -ForegroundColor Yellow
}

$SavcUiUrl = "http://localhost:5174/"
$ProgressHubUrl = "http://localhost:5174/progress-hub/index.html"
Write-Host "[INFO] SAVC-UI URL: $SavcUiUrl" -ForegroundColor Cyan
Write-Host "[INFO] Progress Hub URL: $ProgressHubUrl" -ForegroundColor Cyan

Write-Host "[OK] SAVC startup complete." -ForegroundColor Green
