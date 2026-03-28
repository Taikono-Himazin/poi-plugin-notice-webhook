#Requires -Version 5.1
<#
.SYNOPSIS
    poi-notice モバイルアプリ EAS ビルド & ストア提出スクリプト

.DESCRIPTION
    EAS Build で iOS / Android をビルドし、EAS Submit でストアに提出します。

.PARAMETER Platform
    ビルド対象: ios, android, all (デフォルト: all)

.PARAMETER Profile
    EAS ビルドプロファイル: production, preview (デフォルト: production)

.PARAMETER SkipBuild
    ビルドをスキップし、最新ビルドで Submit のみ実行

.PARAMETER SkipSubmit
    ビルドのみ実行し、Submit をスキップ

.PARAMETER NonInteractive
    確認プロンプトなしで実行

.EXAMPLE
    .\eas-publish.ps1
    .\eas-publish.ps1 -Platform ios
    .\eas-publish.ps1 -Platform android -SkipSubmit
    .\eas-publish.ps1 -SkipBuild -Platform ios
#>

param(
    [ValidateSet("ios", "android", "all")]
    [string] $Platform = "all",
    [ValidateSet("production", "preview")]
    [string] $Profile = "production",
    [switch] $SkipBuild,
    [switch] $SkipSubmit,
    [switch] $NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# ユーティリティ
# -----------------------------------------------------------------------------
function Write-Info    { param($Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Cyan    }
function Write-Success { param($Msg) Write-Host "[OK]    $Msg" -ForegroundColor Green   }
function Write-Warn    { param($Msg) Write-Host "[WARN]  $Msg" -ForegroundColor Yellow  }
function Fail          { param($Msg) Write-Host "[ERROR] $Msg" -ForegroundColor Red; exit 1 }

# -----------------------------------------------------------------------------
# ディレクトリ移動
# -----------------------------------------------------------------------------
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot   = Split-Path -Parent $ScriptDir
$MobileAppDir  = Join-Path $ProjectRoot "mobile-app"

if (-not (Test-Path $MobileAppDir)) { Fail "mobile-app ディレクトリが見つかりません: $MobileAppDir" }
Set-Location $MobileAppDir
Write-Info "作業ディレクトリ: $MobileAppDir"

# -----------------------------------------------------------------------------
# 前提ツール確認
# -----------------------------------------------------------------------------
Write-Host "`n=== 前提ツール確認 ===" -ForegroundColor White -BackgroundColor DarkGray

foreach ($cmd in @("node", "npm", "eas")) {
    $path = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($path) { Write-Success "$cmd : $($path.Source)" }
    else       { Fail "$cmd が見つかりません。インストールしてください。" }
}

# EAS CLI バージョン確認
$easVer = & eas --version 2>&1
Write-Info "EAS CLI: $easVer"

# -----------------------------------------------------------------------------
# aws-outputs.json 確認
# -----------------------------------------------------------------------------
$awsOutputs = Join-Path $MobileAppDir "aws-outputs.json"
if (-not (Test-Path $awsOutputs)) {
    Fail "aws-outputs.json が見つかりません。先に deploy.ps1 を実行してください。"
}
Write-Success "aws-outputs.json を確認しました"

# -----------------------------------------------------------------------------
# バージョン表示（version.json から取得）
# -----------------------------------------------------------------------------
$versionJson = Get-Content (Join-Path (Split-Path $MobileAppDir -Parent) "version.json") -Raw | ConvertFrom-Json
$appVersion = $versionJson.version
Write-Info "アプリバージョン: $appVersion"

# -----------------------------------------------------------------------------
# 確認
# -----------------------------------------------------------------------------
if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "  プラットフォーム : $Platform" -ForegroundColor White
    Write-Host "  プロファイル     : $Profile" -ForegroundColor White
    Write-Host "  ビルド           : $(-not $SkipBuild)" -ForegroundColor White
    Write-Host "  ストア提出       : $(-not $SkipSubmit)" -ForegroundColor White
    Write-Host ""
    $confirm = Read-Host "続行しますか? (y/N)"
    if ($confirm -notin @("y", "Y", "yes")) { Write-Warn "中止しました。"; exit 0 }
}

# プラットフォームリスト
$platforms = if ($Platform -eq "all") { @("ios", "android") } else { @($Platform) }

# -----------------------------------------------------------------------------
# EAS Build
# -----------------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "`n=== EAS Build ===" -ForegroundColor White -BackgroundColor DarkGray

    foreach ($p in $platforms) {
        Write-Info "ビルド開始: $p ($Profile)"
        & eas build --platform $p --profile $Profile --non-interactive
        if ($LASTEXITCODE -ne 0) { Fail "EAS Build ($p) が失敗しました。" }
        Write-Success "ビルド完了: $p"
    }
} else {
    Write-Warn "ビルドをスキップしました (-SkipBuild)"
}

# -----------------------------------------------------------------------------
# EAS Submit
# -----------------------------------------------------------------------------
if (-not $SkipSubmit) {
    Write-Host "`n=== EAS Submit ===" -ForegroundColor White -BackgroundColor DarkGray

    foreach ($p in $platforms) {
        Write-Info "ストア提出開始: $p ($Profile)"
        & eas submit --platform $p --profile $Profile --non-interactive --latest
        if ($LASTEXITCODE -ne 0) { Fail "EAS Submit ($p) が失敗しました。" }
        Write-Success "ストア提出完了: $p"
    }
} else {
    Write-Warn "ストア提出をスキップしました (-SkipSubmit)"
}

# -----------------------------------------------------------------------------
# 完了
# -----------------------------------------------------------------------------
Write-Host "`n=== 完了 ===" -ForegroundColor White -BackgroundColor DarkGray
Write-Success "EAS ビルド & 提出が完了しました (v$appVersion)"
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor White
if ($platforms -contains "ios") {
    Write-Host "  - iOS: App Store Connect でビルドを確認し、審査に提出してください"
}
if ($platforms -contains "android") {
    Write-Host "  - Android: Google Play Console でビルドを確認してください"
}
Write-Host ""
