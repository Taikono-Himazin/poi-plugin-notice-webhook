#Requires -Version 5.1
<#
.SYNOPSIS
    poi-plugin-notice-webhook AWS デプロイスクリプト (PowerShell 版)

.DESCRIPTION
    CDK を使って AWS にデプロイします。--Profile と --Region は必須です。

.PARAMETER Profile
    AWS CLI プロファイル名 (必須)

.PARAMETER Region
    デプロイ先リージョン (必須)  例: ap-northeast-1

.PARAMETER SkipBootstrap
    CDK Bootstrap をスキップする (既に実行済みの場合)

.PARAMETER DryRun
    デプロイせず cdk synth のみ実行

.EXAMPLE
    .\deploy.ps1 -Profile myprofile -Region ap-northeast-1
    .\deploy.ps1 -Profile prod -Region ap-northeast-1 -SkipBootstrap
    # Google ログインのみにする場合は、対話プロンプトで true を入力
    # Apple Sign In を有効にするには Apple Developer の資格情報を対話プロンプトで入力
#>

param(
    [Parameter(Mandatory)][string] $Profile,
    [Parameter(Mandatory)][string] $Region,
    [switch] $SkipBootstrap,
    [switch] $DryRun
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

function Read-Secret {
    param([string]$Prompt)
    $ss = Read-Host -Prompt $Prompt -AsSecureString
    [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
    )
}

function ConvertTo-Dpapi {
    param([string]$PlainText)
    if ([string]::IsNullOrEmpty($PlainText)) { return "" }
    $secure = ConvertTo-SecureString $PlainText -AsPlainText -Force
    return ConvertFrom-SecureString $secure   # DPAPI 暗号化 (ユーザー鍵)
}

function ConvertFrom-Dpapi {
    param([string]$Encrypted)
    if ([string]::IsNullOrEmpty($Encrypted)) { return "" }
    $secure = ConvertTo-SecureString $Encrypted
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

function Get-Value {
    param([string]$EnvVar, [string]$Prompt, [string]$Prefix,
          [bool]$Secret = $true, [bool]$Required = $true)
    # 優先順位: 環境変数 > 保存済み > 対話入力
    $val = [System.Environment]::GetEnvironmentVariable($EnvVar)
    if ([string]::IsNullOrWhiteSpace($val) -and $saved.ContainsKey($EnvVar)) {
        $val = ConvertFrom-Dpapi $saved[$EnvVar]
    }

    if (-not [string]::IsNullOrWhiteSpace($val)) {
        # 保存済みあり: Enter でスキップ、入力すれば上書き
        $hint = if ($Secret) { "$($val.Substring(0, [Math]::Min(4,$val.Length)))****" } else { $val }
        if ($Secret) {
            $new = Read-Secret -Prompt "$Prompt [$hint] (Enter でそのまま)"
        } else {
            $new = Read-Host  -Prompt "$Prompt [$hint] (Enter でそのまま)"
        }
        if (-not [string]::IsNullOrWhiteSpace($new)) { $val = $new }
    } else {
        # 未保存: 必ず入力
        if ($Secret) { $val = Read-Secret -Prompt $Prompt }
        else          { $val = Read-Host  -Prompt $Prompt }
        if ([string]::IsNullOrWhiteSpace($val)) {
            if ($Required) { Fail "$EnvVar が空です。" } else { $val = "" }
        }
    }

    if ($Prefix -and -not $val.StartsWith($Prefix)) {
        Write-Warn "${EnvVar} が ${Prefix} で始まっていません。"
    }
    return $val
}

# -----------------------------------------------------------------------------
# 前提ツール確認
# -----------------------------------------------------------------------------
Write-Host "`n=== 前提ツール確認 ===" -ForegroundColor White -BackgroundColor DarkGray

foreach ($cmd in @("node", "npm", "aws")) {
    $path = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($path) { Write-Success "$cmd : $($path.Source)" }
    else        { Fail "$cmd が見つかりません。インストールしてください。" }
}

$nodeVer = & node -e "process.stdout.write(process.version)"
Write-Info "Node.js バージョン: $nodeVer"

# -----------------------------------------------------------------------------
# AWS 認証確認
# -----------------------------------------------------------------------------
Write-Host "`n=== AWS 認証確認 ===" -ForegroundColor White -BackgroundColor DarkGray
Write-Info "プロファイル: $Profile  /  リージョン: $Region"

try {
    $identity = & aws sts get-caller-identity `
        --profile $Profile `
        --region  $Region  `
        --output  json 2>&1 | ConvertFrom-Json
} catch {
    Fail "AWS 認証に失敗しました。プロファイル「$Profile」を確認してください。`n$_"
}

$AwsAccount = $identity.Account
$AwsUser    = $identity.Arn
Write-Success "認証成功"
Write-Info    "  アカウント ID : $AwsAccount"
Write-Info    "  IAM 識別子    : $AwsUser"

# -----------------------------------------------------------------------------
# aws/ ディレクトリに移動
# -----------------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AwsDir    = Split-Path -Parent $ScriptDir
Set-Location $AwsDir
Write-Info "作業ディレクトリ: $AwsDir"

# -----------------------------------------------------------------------------
# Google ログイン設定（任意）
# -----------------------------------------------------------------------------
Write-Host "`n=== Google ログイン設定（任意）===" -ForegroundColor White -BackgroundColor DarkGray
Write-Info "Google でのサインインを有効にするには Google OAuth クライアントを設定してください。"
Write-Info "不要な場合は Enter でスキップします。"

# 保存済み設定を読み込む
$ConfigFile = Join-Path $AwsDir ".poi-webhook-deploy.json"
$saved = @{}
if (Test-Path $ConfigFile) {
    try {
        $saved = Get-Content $ConfigFile -Raw | ConvertFrom-Json -AsHashtable
        Write-Info "保存済み設定を読み込みました: $ConfigFile"
    } catch {
        Write-Warn "設定ファイルの読み込みに失敗しました。再入力が必要です。"
    }
}

$GoogleClientId = Get-Value "GOOGLE_CLIENT_ID" "Google OAuth クライアント ID (空 Enter でスキップ)" "" $false $false
if (-not [string]::IsNullOrWhiteSpace($GoogleClientId)) {
    $GoogleClientSecret = Get-Value "GOOGLE_CLIENT_SECRET" "Google OAuth クライアントシークレット" "" $true $true

    # Google ログインオンリーモード
    if (-not $saved.ContainsKey("GOOGLE_ONLY")) { $saved["GOOGLE_ONLY"] = "" }
    $prevGoogleOnly = if ($saved["GOOGLE_ONLY"] -eq "true") { "true" } else { "false" }
    $googleOnlyInput = Read-Host -Prompt "Google ログインのみ許可する? (true/false) [$prevGoogleOnly] (Enter でそのまま)"
    if ([string]::IsNullOrWhiteSpace($googleOnlyInput)) { $GoogleOnly = $prevGoogleOnly }
    else { $GoogleOnly = $googleOnlyInput }
} else {
    $GoogleClientSecret = ""
    $GoogleOnly = "false"
    Write-Warn "Google ログインをスキップしました。後から再デプロイして追加できます。"
}

# -----------------------------------------------------------------------------
# Apple Sign In 設定（任意）
# -----------------------------------------------------------------------------
Write-Host "`n=== Apple Sign In 設定（任意）===" -ForegroundColor White -BackgroundColor DarkGray
Write-Info "Sign in with Apple を有効にするには Apple Developer の資格情報を設定してください。"
Write-Info "不要な場合は Enter でスキップします。"

$AppleServiceId = Get-Value "APPLE_SERVICE_ID" "Apple Services ID (空 Enter でスキップ)" "" $false $false
if (-not [string]::IsNullOrWhiteSpace($AppleServiceId)) {
    $AppleTeamId    = Get-Value "APPLE_TEAM_ID"     "Apple Team ID"    "" $false $true
    $AppleKeyId     = Get-Value "APPLE_KEY_ID"      "Apple Key ID"     "" $false $true
    $ApplePrivateKey = Get-Value "APPLE_PRIVATE_KEY" "Apple 秘密鍵 (.p8 の内容、改行は \n で入力)" "" $true $true
} else {
    $AppleTeamId    = ""
    $AppleKeyId     = ""
    $ApplePrivateKey = ""
    Write-Warn "Apple Sign In をスキップしました。後から再デプロイして追加できます。"
}

# 設定を DPAPI 暗号化して保存
$toSave = @{
    GOOGLE_CLIENT_ID     = ConvertTo-Dpapi $GoogleClientId
    GOOGLE_CLIENT_SECRET = ConvertTo-Dpapi $GoogleClientSecret
    GOOGLE_ONLY          = $GoogleOnly
    APPLE_SERVICE_ID     = ConvertTo-Dpapi $AppleServiceId
    APPLE_TEAM_ID        = ConvertTo-Dpapi $AppleTeamId
    APPLE_KEY_ID         = ConvertTo-Dpapi $AppleKeyId
    APPLE_PRIVATE_KEY    = ConvertTo-Dpapi $ApplePrivateKey
}
$toSave | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8
Write-Success "設定を暗号化して保存しました: $ConfigFile (DPAPI)"

# -----------------------------------------------------------------------------
# npm install
# -----------------------------------------------------------------------------
Write-Host "`n=== npm install ===" -ForegroundColor White -BackgroundColor DarkGray
& npm install --prefer-offline
if ($LASTEXITCODE -ne 0) { Fail "npm install が失敗しました。" }
Write-Success "npm install 完了"

# -----------------------------------------------------------------------------
# TypeScript ビルド確認
# -----------------------------------------------------------------------------
Write-Host "`n=== TypeScript ビルド ===" -ForegroundColor White -BackgroundColor DarkGray
& npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Fail "TypeScript のビルドエラーがあります。修正してください。" }
Write-Success "TypeScript チェック完了"

# jsii の Node.js バージョン未テスト警告を抑制 (動作には影響しない)
$Env:JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION = "1"
# CDK がリージョン・プロファイルを確実に認識するよう環境変数にも設定
$Env:AWS_PROFILE         = $Profile
$Env:AWS_DEFAULT_REGION  = $Region

if (-not $SkipBootstrap) {
    Write-Host "`n=== CDK Bootstrap ===" -ForegroundColor White -BackgroundColor DarkGray
    Write-Info "aws://${AwsAccount}/${Region} をブートストラップします..."
    & npx cdk bootstrap "aws://${AwsAccount}/${Region}" `
        --profile $Profile `
        --region  $Region
    if ($LASTEXITCODE -ne 0) { Fail "CDK Bootstrap が失敗しました。" }
    Write-Success "Bootstrap 完了"
} else {
    Write-Warn "Bootstrap をスキップしました (-SkipBootstrap)"
}

# -----------------------------------------------------------------------------
# CDK パラメータ
# -----------------------------------------------------------------------------
$CdkParams = @(
    "--parameters", "GoogleClientId=$GoogleClientId",
    "--parameters", "GoogleClientSecret=$GoogleClientSecret",
    "--parameters", "GoogleOnly=$GoogleOnly",
    "--parameters", "AppleServiceId=$AppleServiceId",
    "--parameters", "AppleTeamId=$AppleTeamId",
    "--parameters", "AppleKeyId=$AppleKeyId",
    "--parameters", "ApplePrivateKey=$ApplePrivateKey"
)

# -----------------------------------------------------------------------------
# CDK Synth / Deploy
# -----------------------------------------------------------------------------
if ($DryRun) {
    Write-Host "`n=== CDK Synth (dry-run) ===" -ForegroundColor White -BackgroundColor DarkGray
    & npx cdk synth PoiWebhookStack --profile $Profile --region $Region @CdkParams
    Write-Success "Synth 完了 (デプロイはスキップ)"
    exit 0
}

Write-Host "`n=== CDK Deploy ===" -ForegroundColor White -BackgroundColor DarkGray
Write-Info "スタック: PoiWebhookStack"
Write-Info "リージョン: $Region  /  プロファイル: $Profile"

$OutputsFile = Join-Path $AwsDir "aws-outputs.json"

& npx cdk deploy PoiWebhookStack `
    --profile          $Profile `
    --region           $Region  `
    --require-approval never    `
    --outputs-file     $OutputsFile `
    @CdkParams

if ($LASTEXITCODE -ne 0) { Fail "CDK Deploy が失敗しました。" }

# src/ にコピー（プラグイン起動時に自動読み込み）
$SrcDir = Join-Path (Split-Path $AwsDir -Parent) "src"
if ((Test-Path $OutputsFile) -and (Test-Path $SrcDir)) {
    Copy-Item $OutputsFile (Join-Path $SrcDir "aws-outputs.json") -Force
    Write-Success "CDK Outputs を src\aws-outputs.json にコピーしました"
}

# mobile-app/ にコピー（スマホアプリ起動時に自動読み込み）
$MobileAppDir = Join-Path (Split-Path $AwsDir -Parent) "mobile-app"
if ((Test-Path $OutputsFile) -and (Test-Path $MobileAppDir)) {
    Copy-Item $OutputsFile (Join-Path $MobileAppDir "aws-outputs.json") -Force
    Write-Success "CDK Outputs を mobile-app\aws-outputs.json にコピーしました"
}

# -----------------------------------------------------------------------------
# デプロイ後: Outputs 表示
# -----------------------------------------------------------------------------
Write-Host "`n=== デプロイ結果 ===" -ForegroundColor White -BackgroundColor DarkGray

$outputs = & aws cloudformation describe-stacks `
    --stack-name PoiWebhookStack `
    --profile    $Profile `
    --region     $Region  `
    --query      "Stacks[0].Outputs" `
    --output     json | ConvertFrom-Json

foreach ($o in $outputs) {
    Write-Host ("  {0,-25} = {1}" -f $o.OutputKey, $o.OutputValue) -ForegroundColor White
}

$apiUrl = ($outputs | Where-Object { $_.OutputKey -eq "ApiUrl" }).OutputValue

Write-Host ""
Write-Success "デプロイ完了!"
Write-Success "CDK Outputs を保存しました: $OutputsFile"
Write-Info   "  → poi プラグインを再起動すると AWS モードの設定が自動入力されます"
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor White
Write-Host "  1. poi を再起動してプラグインを開き、AWS モードを選択してログインしてください"
Write-Host ""
