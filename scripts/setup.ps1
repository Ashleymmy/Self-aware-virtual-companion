Write-Host "=== SAVC Setup (WSL2 recommended) ===" -ForegroundColor Cyan

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Write-Host "[INFO] Repo root: $RepoRoot" -ForegroundColor Gray

if (Get-Command wsl -ErrorAction SilentlyContinue) {
  $LinuxRoot = wsl wslpath -a "$RepoRoot"
  if (-not $LinuxRoot) {
    Write-Host "[ERROR] Failed to resolve Linux path via wslpath." -ForegroundColor Red
    exit 1
  }

  Write-Host "[INFO] Running setup in WSL: $LinuxRoot" -ForegroundColor Yellow
  wsl -e bash -lc "cd '$LinuxRoot' && bash scripts/setup.sh"
  exit $LASTEXITCODE
}

Write-Host "[ERROR] WSL not found. Please run in WSL2 or Git Bash:" -ForegroundColor Red
Write-Host "  bash scripts/setup.sh" -ForegroundColor Gray
exit 1

