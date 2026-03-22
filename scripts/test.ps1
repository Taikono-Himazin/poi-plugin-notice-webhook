<#
.SYNOPSIS
  全テストを実行するスクリプト
.EXAMPLE
  .\scripts\test.ps1
  .\scripts\test.ps1 -Target aws
  .\scripts\test.ps1 -Target plugin
  .\scripts\test.ps1 -Target mobile
#>
param(
  [ValidateSet('all', 'aws', 'plugin', 'mobile')]
  [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$failed = $false

function Run-Tests {
  param([string]$Name, [string]$Dir)

  Write-Host "`n========================================" -ForegroundColor Cyan
  Write-Host "  $Name" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  Push-Location $Dir
  try {
    if (-not (Test-Path 'node_modules')) {
      Write-Host 'npm install ...' -ForegroundColor Yellow
      npm install --silent
    }
    npx jest --verbose --coverage
    if ($LASTEXITCODE -ne 0) {
      $script:failed = $true
    }
  }
  finally {
    Pop-Location
  }
}

if ($Target -eq 'all' -or $Target -eq 'aws') {
  Run-Tests -Name 'AWS Lambda Tests' -Dir (Join-Path $root 'aws')
}

if ($Target -eq 'all' -or $Target -eq 'plugin') {
  Run-Tests -Name 'Plugin Pure Function Tests' -Dir (Join-Path $root 'src')
}

if ($Target -eq 'all' -or $Target -eq 'mobile') {
  Run-Tests -Name 'Mobile App Tests' -Dir (Join-Path $root 'mobile-app')
}

Write-Host ''
if ($failed) {
  Write-Host 'SOME TESTS FAILED' -ForegroundColor Red
  exit 1
}
else {
  Write-Host 'ALL TESTS PASSED' -ForegroundColor Green
  exit 0
}
