#Requires -Version 5.1
<#
.SYNOPSIS
    poi-notice モバイルアプリ EAS パブリッシュスクリプト

.DESCRIPTION
    変更内容を自動判定し、EAS Build (ネイティブ変更時) または EAS Update (JS のみ) を実行します。
    -Mode auto (デフォルト) で git diff からネイティブ変更を検出し、build / update を自動選択します。

.PARAMETER Platform
    ビルド対象: ios, android, all (デフォルト: all)

.PARAMETER Profile
    EAS プロファイル: production, preview (デフォルト: production)

.PARAMETER Mode
    パブリッシュ方式: auto, build, update (デフォルト: auto)
    auto  — git diff でネイティブ変更を検出し自動判定
    build — 強制フルビルド + Submit
    update — 強制 OTA アップデート

.PARAMETER BaseBranch
    auto モードの比較基準ブランチ (デフォルト: origin/main)

.PARAMETER SkipSubmit
    build 時にストア提出をスキップ

.PARAMETER NonInteractive
    確認プロンプトなしで実行

.EXAMPLE
    .\eas-publish.ps1                           # auto判定
    .\eas-publish.ps1 -Mode build -Platform ios  # 強制ビルド
    .\eas-publish.ps1 -Mode update               # 強制OTAアップデート
#>

param(
    [ValidateSet("ios", "android", "all")]
    [string] $Platform = "all",
    [ValidateSet("production", "preview")]
    [string] $Profile = "production",
    [ValidateSet("auto", "build", "update")]
    [string] $Mode = "auto",
    [string] $BaseBranch = "origin/main",
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

foreach ($cmd in @("node", "npm", "eas", "git")) {
    $path = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($path) { Write-Success "$cmd : $($path.Source)" }
    else       { Fail "$cmd が見つかりません。インストールしてください。" }
}

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
# バージョン表示
# -----------------------------------------------------------------------------
$versionJson = Get-Content (Join-Path $ProjectRoot "version.json") -Raw | ConvertFrom-Json
$appVersion = $versionJson.version
Write-Info "アプリバージョン: $appVersion"

# -----------------------------------------------------------------------------
# ネイティブ変更検出 (auto モード)
# -----------------------------------------------------------------------------

# ネイティブ変更と判定するパターン (mobile-app/ 配下の相対パス)
$NativePatterns = @(
    "^mobile-app/modules/",        # ネイティブモジュール (Swift/Kotlin)
    "^mobile-app/targets/",        # Widget Extension (Swift)
    "^mobile-app/plugins/",        # Expo Config Plugins
    "^mobile-app/ios/",            # iOS ネイティブプロジェクト
    "^mobile-app/android/",        # Android ネイティブプロジェクト
    "^mobile-app/app\.config\.",   # Expo 設定 (plugins, entitlements)
    "^mobile-app/eas\.json",       # EAS ビルド設定
    "^mobile-app/package\.json",   # 依存関係 / autolinking
    "^mobile-app/package-lock\.json"
)

function Test-NativeChanges {
    param([string] $Base)

    Write-Info "変更検出: $Base と比較中..."

    # コミット済み差分 + 未コミット差分
    $committed = & git diff --name-only "$Base" HEAD -- mobile-app/ 2>$null
    $uncommitted = & git diff --name-only HEAD -- mobile-app/ 2>$null
    $untracked = & git ls-files --others --exclude-standard -- mobile-app/ 2>$null

    $allChanges = @()
    if ($committed)   { $allChanges += $committed }
    if ($uncommitted) { $allChanges += $uncommitted }
    if ($untracked)   { $allChanges += $untracked }
    $allChanges = $allChanges | Sort-Object -Unique

    if ($allChanges.Count -eq 0) {
        Write-Warn "mobile-app/ に変更がありません"
        return @{ NeedsBuild = $false; NativeFiles = @(); JsFiles = @() }
    }

    $nativeFiles = @()
    $jsFiles = @()

    foreach ($file in $allChanges) {
        $isNative = $false
        foreach ($pattern in $NativePatterns) {
            if ($file -match $pattern) {
                $isNative = $true
                break
            }
        }
        if ($isNative) { $nativeFiles += $file }
        else           { $jsFiles += $file }
    }

    return @{
        NeedsBuild  = ($nativeFiles.Count -gt 0)
        NativeFiles = $nativeFiles
        JsFiles     = $jsFiles
    }
}

# 判定実行
$resolvedMode = $Mode
if ($Mode -eq "auto") {
    # base ブランチに切り替え
    Set-Location $ProjectRoot
    $detection = Test-NativeChanges -Base $BaseBranch
    Set-Location $MobileAppDir

    Write-Host ""
    Write-Host "=== 変更検出結果 ===" -ForegroundColor White -BackgroundColor DarkGray

    if ($detection.NativeFiles.Count -gt 0) {
        Write-Warn "ネイティブ変更あり → eas build が必要です"
        Write-Host ""
        Write-Host "  ネイティブ変更:" -ForegroundColor Yellow
        foreach ($f in $detection.NativeFiles) {
            Write-Host "    - $f" -ForegroundColor Yellow
        }
    }
    if ($detection.JsFiles.Count -gt 0) {
        Write-Host "  JS/TS 変更:" -ForegroundColor Cyan
        foreach ($f in $detection.JsFiles) {
            Write-Host "    - $f" -ForegroundColor Cyan
        }
    }
    if ($detection.NativeFiles.Count -eq 0 -and $detection.JsFiles.Count -eq 0) {
        Write-Warn "変更なし — パブリッシュ不要です"
        exit 0
    }

    $resolvedMode = if ($detection.NeedsBuild) { "build" } else { "update" }
    Write-Host ""
    Write-Info "自動判定: $resolvedMode"
}

# プラットフォームリスト
$platforms = if ($Platform -eq "all") { @("ios", "android") } else { @($Platform) }

# channel 名はプロファイルと一致
$channel = $Profile

# -----------------------------------------------------------------------------
# 確認
# -----------------------------------------------------------------------------
if (-not $NonInteractive) {
    Write-Host ""
    Write-Host "  モード           : $resolvedMode" -ForegroundColor White
    Write-Host "  プラットフォーム : $Platform" -ForegroundColor White
    Write-Host "  プロファイル     : $Profile" -ForegroundColor White
    if ($resolvedMode -eq "build") {
        Write-Host "  ストア提出       : $(-not $SkipSubmit)" -ForegroundColor White
    }
    Write-Host ""
    $confirm = Read-Host "続行しますか? (y/N)"
    if ($confirm -notin @("y", "Y", "yes")) { Write-Warn "中止しました。"; exit 0 }
}

# =============================================================================
# EAS Update (OTA)
# =============================================================================
if ($resolvedMode -eq "update") {
    Write-Host "`n=== EAS Update (OTA) ===" -ForegroundColor White -BackgroundColor DarkGray

    # expo-updates が必要
    $hasExpoUpdates = & node -e "try { require.resolve('expo-updates'); process.exit(0) } catch { process.exit(1) }" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Fail "expo-updates がインストールされていません。`n  npx expo install expo-updates`n  を実行してから再度お試しください（※ 初回は eas build も必要）。"
    }

    Write-Info "OTA アップデート: channel=$channel"
    & eas update --channel $channel --message "v$appVersion OTA update" --non-interactive
    if ($LASTEXITCODE -ne 0) { Fail "EAS Update が失敗しました。" }
    Write-Success "OTA アップデート完了 (channel: $channel)"
}

# =============================================================================
# EAS Build + Submit
# =============================================================================
if ($resolvedMode -eq "build") {
    Write-Host "`n=== EAS Build ===" -ForegroundColor White -BackgroundColor DarkGray

    foreach ($p in $platforms) {
        Write-Info "ビルド開始: $p ($Profile)"
        & eas build --platform $p --profile $Profile --non-interactive
        if ($LASTEXITCODE -ne 0) { Fail "EAS Build ($p) が失敗しました。" }
        Write-Success "ビルド完了: $p"
    }

    # Submit
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
}

# -----------------------------------------------------------------------------
# 完了
# -----------------------------------------------------------------------------
Write-Host "`n=== 完了 ===" -ForegroundColor White -BackgroundColor DarkGray

if ($resolvedMode -eq "update") {
    Write-Success "OTA アップデートが完了しました (v$appVersion → channel: $channel)"
    Write-Host "`n次のステップ:" -ForegroundColor White
    Write-Host "  - アプリを再起動すると新しい JS バンドルが反映されます"
} else {
    Write-Success "EAS ビルド & 提出が完了しました (v$appVersion)"
    Write-Host "`n次のステップ:" -ForegroundColor White
    if ($platforms -contains "ios") {
        Write-Host "  - iOS: App Store Connect でビルドを確認し、審査に提出してください"
    }
    if ($platforms -contains "android") {
        Write-Host "  - Android: Google Play Console でビルドを確認してください"
    }
}
Write-Host ""
