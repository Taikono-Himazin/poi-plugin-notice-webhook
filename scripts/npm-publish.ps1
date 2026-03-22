#Requires -Version 5.1
<#
.SYNOPSIS
    poi-plugin-notice-webhook npm パブリッシュスクリプト

.DESCRIPTION
    src/ ディレクトリの poi プラグインを npm に公開します。

.PARAMETER DryRun
    実際には公開せず、パッケージ内容の確認のみ行う

.PARAMETER SkipTest
    テストをスキップする

.EXAMPLE
    .\npm-publish.ps1
    .\npm-publish.ps1 -DryRun
#>

param(
    [switch] $DryRun,
    [switch] $SkipTest
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
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SrcDir      = Join-Path $ProjectRoot "src"

if (-not (Test-Path $SrcDir)) { Fail "src ディレクトリが見つかりません: $SrcDir" }
Set-Location $SrcDir
Write-Info "作業ディレクトリ: $SrcDir"

# -----------------------------------------------------------------------------
# 前提確認
# -----------------------------------------------------------------------------
Write-Host "`n=== 前提確認 ===" -ForegroundColor White -BackgroundColor DarkGray

foreach ($cmd in @("node", "npm")) {
    $path = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($path) { Write-Success "$cmd : $($path.Source)" }
    else       { Fail "$cmd が見つかりません。" }
}

# npm ログイン確認
$npmUser = & npm whoami 2>&1
if ($LASTEXITCODE -ne 0) { Fail "npm にログインしていません。'npm login' を実行してください。" }
Write-Success "npm ユーザー: $npmUser"

# -----------------------------------------------------------------------------
# package.json 読み込み
# -----------------------------------------------------------------------------
$pkgJson = Get-Content (Join-Path $SrcDir "package.json") -Raw | ConvertFrom-Json
$pkgName    = $pkgJson.name
$pkgVersion = $pkgJson.version
Write-Info "パッケージ: $pkgName@$pkgVersion"

# 既に公開済みか確認
$publishedVersions = & npm view $pkgName versions --json 2>&1
if ($LASTEXITCODE -eq 0) {
    $versions = $publishedVersions | ConvertFrom-Json
    if ($versions -contains $pkgVersion) {
        Fail "バージョン $pkgVersion は既に公開済みです。package.json のバージョンを上げてください。"
    }
    Write-Success "バージョン $pkgVersion は未公開です"
} else {
    Write-Info "新規パッケージとして公開します"
}

# -----------------------------------------------------------------------------
# files フィールドのファイル存在確認
# -----------------------------------------------------------------------------
Write-Host "`n=== パッケージ内容確認 ===" -ForegroundColor White -BackgroundColor DarkGray

$files = $pkgJson.files
if ($files) {
    foreach ($f in $files) {
        $target = Join-Path $SrcDir $f
        if (Test-Path $target) { Write-Success "  $f" }
        else { Fail "files に記載されたファイルが見つかりません: $f" }
    }
}

# npm pack で中身を確認
Write-Info "パッケージ内容をプレビュー:"
& npm pack --dry-run
if ($LASTEXITCODE -ne 0) { Fail "npm pack --dry-run が失敗しました。" }

# -----------------------------------------------------------------------------
# テスト
# -----------------------------------------------------------------------------
if (-not $SkipTest) {
    $testScript = $pkgJson.scripts.test
    if ($testScript -and $testScript -notmatch "no test specified") {
        Write-Host "`n=== テスト実行 ===" -ForegroundColor White -BackgroundColor DarkGray
        & npm test
        if ($LASTEXITCODE -ne 0) { Fail "テストが失敗しました。" }
        Write-Success "テスト完了"
    } else {
        Write-Warn "テストスクリプトが未設定のためスキップします"
    }
} else {
    Write-Warn "テストをスキップしました (-SkipTest)"
}

# -----------------------------------------------------------------------------
# パブリッシュ
# -----------------------------------------------------------------------------
Write-Host "`n=== npm publish ===" -ForegroundColor White -BackgroundColor DarkGray

if ($DryRun) {
    Write-Warn "ドライランモード: 実際には公開しません"
    & npm publish --dry-run
    Write-Success "ドライラン完了"
} else {
    Write-Info "$pkgName@$pkgVersion を公開します..."
    & npm publish
    if ($LASTEXITCODE -ne 0) { Fail "npm publish が失敗しました。" }
    Write-Success "$pkgName@$pkgVersion を公開しました"
}

# -----------------------------------------------------------------------------
# 完了
# -----------------------------------------------------------------------------
Write-Host ""
Write-Success "完了!"
if (-not $DryRun) {
    Write-Host "  https://www.npmjs.com/package/$pkgName" -ForegroundColor Cyan
}
Write-Host ""
