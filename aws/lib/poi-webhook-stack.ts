import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration, CfnParameter, CfnCondition, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as fs from 'fs';

export class PoiWebhookStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ----------------------------------------------------------------
    // デプロイ時パラメータ
    // ----------------------------------------------------------------
    const googleClientIdParam = new CfnParameter(this, 'GoogleClientId', {
      type: 'String',
      default: '',
      description: 'Google OAuth 2.0 クライアント ID（空白でスキップ）',
    });
    const googleClientSecretParam = new CfnParameter(this, 'GoogleClientSecret', {
      type: 'String',
      noEcho: true,
      default: '',
      description: 'Google OAuth 2.0 クライアントシークレット',
    });
    const googleOnlyParam = new CfnParameter(this, 'GoogleOnly', {
      type: 'String',
      default: 'false',
      allowedValues: ['true', 'false'],
      description: 'true にすると Google ログインのみ許可（メール/パスワードによるサインアップ・サインインを無効化）',
    });

    const appleServiceIdParam = new CfnParameter(this, 'AppleServiceId', {
      type: 'String',
      default: '',
      description: 'Apple Services ID（空白でスキップ）',
    });
    const appleTeamIdParam = new CfnParameter(this, 'AppleTeamId', {
      type: 'String',
      default: '',
      description: 'Apple Team ID',
    });
    const appleKeyIdParam = new CfnParameter(this, 'AppleKeyId', {
      type: 'String',
      default: '',
      description: 'Apple Key ID',
    });
    const applePrivateKeyPathParam = new CfnParameter(this, 'ApplePrivateKeyPath', {
      type: 'String',
      default: '',
      description: 'Apple 秘密鍵 .p8 ファイルパス（synth 時に読み込み）',
    });

    // ----------------------------------------------------------------
    // Cognito User Pool + Managed Login
    // ----------------------------------------------------------------
    const hasGoogle = new CfnCondition(this, 'HasGoogleCredentials', {
      expression: Fn.conditionNot(Fn.conditionEquals(googleClientIdParam.valueAsString, '')),
    });
    const hasApple = new CfnCondition(this, 'HasAppleCredentials', {
      expression: Fn.conditionNot(Fn.conditionEquals(appleServiceIdParam.valueAsString, '')),
    });
    const hasGoogleAndApple = new CfnCondition(this, 'HasGoogleAndApple', {
      expression: Fn.conditionAnd(
        Fn.conditionNot(Fn.conditionEquals(googleClientIdParam.valueAsString, '')),
        Fn.conditionNot(Fn.conditionEquals(appleServiceIdParam.valueAsString, '')),
      ),
    });
    const isGoogleOnly = new CfnCondition(this, 'IsGoogleOnly', {
      expression: Fn.conditionAnd(
        Fn.conditionNot(Fn.conditionEquals(googleClientIdParam.valueAsString, '')),
        Fn.conditionEquals(googleOnlyParam.valueAsString, 'true'),
      ),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'poi-webhook-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    // GoogleOnly 時はセルフサインアップを無効化（Google IdP 経由のみ許可）
    cfnUserPool.addPropertyOverride(
      'AdminCreateUserConfig.AllowAdminCreateUserOnly',
      Fn.conditionIf('IsGoogleOnly', true, false),
    );
    // NEWER_MANAGED_LOGIN のサインアップ時メール認証チャレンジに必要
    cfnUserPool.addPropertyOverride('Policies.SignInPolicy', {
      AllowedFirstAuthFactors: ['PASSWORD', 'EMAIL_OTP'],
    });

    // Cognito Managed Login ドメイン
    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `poi-webhook-${this.account}` },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Google Identity Provider（条件付き）
    const googleIdP = new cognito.CfnUserPoolIdentityProvider(this, 'GoogleIdP', {
      userPoolId: userPool.userPoolId,
      providerName: 'Google',
      providerType: 'Google',
      providerDetails: {
        client_id: googleClientIdParam.valueAsString,
        client_secret: googleClientSecretParam.valueAsString,
        authorize_scopes: 'openid email profile',
      },
      attributeMapping: { email: 'email', name: 'name' },
    });
    googleIdP.cfnOptions.condition = hasGoogle;

    // Apple 秘密鍵: CLIパラメータでは改行が壊れるため synth 時にファイルから読み込む
    const appleKeyPath = applePrivateKeyPathParam.valueAsString;
    let applePrivateKeyContent = '';
    // CfnParameter の valueAsString は synth 時にはトークンなので、
    // CDK context 経由で実パスを取得してファイルを読む
    const appleKeyPathFromContext = this.node.tryGetContext('applePrivateKeyPath') as string | undefined;
    if (appleKeyPathFromContext && fs.existsSync(appleKeyPathFromContext)) {
      applePrivateKeyContent = fs.readFileSync(appleKeyPathFromContext, 'utf8').trim();
    }

    // Apple Identity Provider（条件付き）
    const appleIdP = new cognito.CfnUserPoolIdentityProvider(this, 'AppleIdP', {
      userPoolId: userPool.userPoolId,
      providerName: 'SignInWithApple',
      providerType: 'SignInWithApple',
      providerDetails: {
        client_id: appleServiceIdParam.valueAsString,
        team_id: appleTeamIdParam.valueAsString,
        key_id: appleKeyIdParam.valueAsString,
        private_key: applePrivateKeyContent,
        authorize_scopes: 'name email',
      },
      attributeMapping: { email: 'email', name: 'name' },
    });
    appleIdP.cfnOptions.condition = hasApple;

    // User Pool Client（L1 — Google/Apple を条件付きでサポート）
    const userPoolClientCfn = new cognito.CfnUserPoolClient(this, 'UserPoolClient', {
      userPoolId: userPool.userPoolId,
      clientName: 'WebClient',
      generateSecret: false,
      explicitAuthFlows: [
        'ALLOW_USER_AUTH',
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
      allowedOAuthFlows: ['code'],
      allowedOAuthScopes: ['openid', 'email', 'profile'],
      allowedOAuthFlowsUserPoolClient: true,
      callbackUrLs: ['http://localhost:17890/callback', 'poi-notice://auth'],
      logoutUrLs: ['http://localhost:17890/logout', 'poi-notice://logout'],
      refreshTokenValidity: 3650,
      tokenValidityUnits: { refreshToken: 'days' },
    });
    // IdP が作成されてから Client を更新する（条件が false なら無視される）
    userPoolClientCfn.addDependency(googleIdP);
    userPoolClientCfn.addDependency(appleIdP);

    userPoolClientCfn.addPropertyOverride(
      'SupportedIdentityProviders',
      Fn.conditionIf(
        'IsGoogleOnly',
        Fn.conditionIf('HasGoogleAndApple', ['Google', 'SignInWithApple'], ['Google']),
        Fn.conditionIf(
          'HasGoogleAndApple',
          ['COGNITO', 'Google', 'SignInWithApple'],
          Fn.conditionIf(
            'HasGoogleCredentials',
            ['COGNITO', 'Google'],
            Fn.conditionIf('HasAppleCredentials', ['COGNITO', 'SignInWithApple'], ['COGNITO']),
          ),
        ),
      ),
    );

    // Managed Login ブランディング（Cognito デフォルトスタイルを使用）
    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClientCfn.ref,
      useCognitoProvidedValues: true,
    });

    // ----------------------------------------------------------------
    // DynamoDB テーブル
    // ----------------------------------------------------------------
    const accountsTable = new dynamodb.Table(this, 'AccountsTable', {
      tableName: 'poi-webhook-accounts',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const tokensTable = new dynamodb.Table(this, 'TokensTable', {
      tableName: 'poi-webhook-tokens',
      partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    tokensTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: 'poi-webhook-notifications',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // タイマー状態テーブル（userId: PK, pk: SK = "type#slot"）
    const timersTable = new dynamodb.Table(this, 'TimersTable', {
      tableName: 'poi-webhook-timers',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // エラー収集テーブル（source: PK, timestamp: SK）
    const errorsTable = new dynamodb.Table(this, 'ErrorsTable', {
      tableName: 'poi-webhook-errors',
      partitionKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 通知統計テーブル（userId: PK, month: SK = "YYYY-MM"）
    // 各月の通知回数を type 別にカウント
    const statsTable = new dynamodb.Table(this, 'StatsTable', {
      tableName: 'poi-webhook-stats',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'month', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // プッシュトークンテーブル（userId: PK, pushToken: SK）
    // モバイルアプリの Expo Push Token を管理（サイレントプッシュ送信用）
    const pushTokensTable = new dynamodb.Table(this, 'PushTokensTable', {
      tableName: 'poi-webhook-push-tokens',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pushToken', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ----------------------------------------------------------------
    // Lambda 共通設定
    // ----------------------------------------------------------------
    const srcDir = path.join(__dirname, '..', 'src');

    const commonEnv: Record<string, string> = {
      ACCOUNTS_TABLE: accountsTable.tableName,
      TOKENS_TABLE: tokensTable.tableName,
      NOTIFICATIONS_TABLE: notificationsTable.tableName,
      TIMERS_TABLE: timersTable.tableName,
      STATS_TABLE: statsTable.tableName,
      PUSH_TOKENS_TABLE: pushTokensTable.tableName,
      ERRORS_TABLE: errorsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClientCfn.ref,
    };

    const fn = (id: string, entry: string, extraEnv: Record<string, string> = {}) =>
      new lambda_nodejs.NodejsFunction(this, id, {
        functionName: `poi-webhook-${id.replace(/Function$/, '').toLowerCase()}`,
        entry: path.join(srcDir, entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_24_X,
        timeout: Duration.seconds(30),
        memorySize: 256,
        bundling: { minify: true, sourceMap: false },
        environment: { ...commonEnv, ...extraEnv },
      });

    // ----------------------------------------------------------------
    // Lambda 関数
    // ----------------------------------------------------------------

    // 遅延配信
    const deliverFn = fn('DeliverFunction', 'deliver/index.js');
    notificationsTable.grantReadWriteData(deliverFn);
    accountsTable.grantReadData(deliverFn);

    // EventBridge Scheduler 用 IAM ロール
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      inlinePolicies: {
        InvokeLambda: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: [deliverFn.functionArn],
            }),
          ],
        }),
      },
    });

    // 通知受信（認証不要 — トークンが認証の役割）
    const ingestFn = fn('IngestFunction', 'ingest/index.js', {
      DELIVER_FUNCTION_ARN: deliverFn.functionArn,
      SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
    });
    tokensTable.grantReadData(ingestFn);
    accountsTable.grantReadWriteData(ingestFn);
    notificationsTable.grantReadWriteData(ingestFn);
    statsTable.grantReadWriteData(ingestFn);
    ingestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule'],
        resources: ['*'],
      }),
    );
    ingestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
      }),
    );

    // アカウント設定（Cognito 認証）
    const accountConfigFn = fn('AccountConfigFunction', 'account/config.js');
    accountsTable.grantReadWriteData(accountConfigFn);

    // アカウント削除（Cognito 認証）
    const accountDeleteFn = fn('AccountDeleteFunction', 'account/delete.js');
    accountsTable.grantReadWriteData(accountDeleteFn);
    tokensTable.grantReadWriteData(accountDeleteFn);
    timersTable.grantReadWriteData(accountDeleteFn);
    notificationsTable.grantReadWriteData(accountDeleteFn);
    statsTable.grantReadWriteData(accountDeleteFn);
    pushTokensTable.grantReadWriteData(accountDeleteFn);
    accountDeleteFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [userPool.userPoolArn],
      }),
    );
    accountDeleteFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:DeleteSchedule'],
        resources: ['*'],
      }),
    );

    // トークン管理（要認証）— 既存クライアントとの互換性のために残す
    const tokenCreateFn = fn('TokenCreateFunction', 'tokens/create.js');
    tokensTable.grantReadWriteData(tokenCreateFn);
    accountsTable.grantReadData(tokenCreateFn);

    const tokenListFn = fn('TokenListFunction', 'tokens/list.js');
    tokensTable.grantReadData(tokenListFn);

    const tokenDeleteFn = fn('TokenDeleteFunction', 'tokens/delete.js');
    tokensTable.grantReadWriteData(tokenDeleteFn);

    // タイマー同期（Cognito 認証）
    const timerSyncFn = fn('TimerSyncFunction', 'timers/sync.js', {
      DELIVER_FUNCTION_ARN: deliverFn.functionArn,
      SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
    });
    accountsTable.grantReadData(timerSyncFn);
    notificationsTable.grantReadWriteData(timerSyncFn);
    timersTable.grantReadWriteData(timerSyncFn);
    timerSyncFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
        resources: ['*'],
      }),
    );
    timerSyncFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
      }),
    );

    // タイマー取得（Cognito 認証、モバイルアプリ用）
    const timerGetFn = fn('TimerGetFunction', 'timers/get.js');
    timersTable.grantReadData(timerGetFn);

    // サイレントプッシュ送信のため sync Lambda にプッシュトークンの読み書き権限を付与
    pushTokensTable.grantReadWriteData(timerSyncFn);

    // プッシュトークン登録・削除（Cognito 認証、モバイルアプリ用）
    const pushTokenRegisterFn = fn('PushTokenRegisterFunction', 'push-tokens/register.js');
    pushTokensTable.grantReadWriteData(pushTokenRegisterFn);

    const pushTokenDeleteFn = fn('PushTokenDeleteFunction', 'push-tokens/delete.js');
    pushTokensTable.grantReadWriteData(pushTokenDeleteFn);

    // エラー収集（認証不要）
    const errorReportFn = fn('ErrorReportFunction', 'errors/report.js');
    errorReportFn.node.addDependency(errorsTable);
    errorsTable.grantWriteData(errorReportFn);

    // エラー一覧（Cognito 認証）
    const errorListFn = fn('ErrorListFunction', 'errors/list.js');
    errorsTable.grantReadData(errorListFn);

    // エラーダッシュボード（HTML を返す、認証不要）
    const errorDashboardFn = fn('ErrorDashboardFunction', 'errors/dashboard.js');

    // ----------------------------------------------------------------
    // API Gateway
    // ----------------------------------------------------------------
    const api = new apigateway.RestApi(this, 'WebhookApi', {
      restApiName: 'poi-webhook-api',
      deployOptions: { stageName: 'v1' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });
    const withAuth: Partial<apigateway.MethodOptions> = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };
    const lam = (f: lambda.IFunction) => new apigateway.LambdaIntegration(f);

    // 通知受信（認証不要 — トークンが認証の役割）
    api.root.addResource('webhooks').addResource('{token}').addMethod('POST', lam(ingestFn));

    // タイマー同期・取得（Cognito 認証）
    const timersRes = api.root.addResource('timers');
    timersRes.addMethod('PUT', lam(timerSyncFn), withAuth);
    timersRes.addMethod('GET', lam(timerGetFn), withAuth);

    // アカウント設定・削除（Cognito 認証）
    const accountRes = api.root.addResource('account');
    const accountConfigRes = accountRes.addResource('config');
    accountConfigRes.addMethod('GET', lam(accountConfigFn), withAuth);
    accountConfigRes.addMethod('PUT', lam(accountConfigFn), withAuth);
    accountRes.addMethod('DELETE', lam(accountDeleteFn), withAuth);

    // プッシュトークン管理（Cognito 認証、モバイルアプリ用）
    const pushTokensRes = api.root.addResource('push-tokens');
    pushTokensRes.addMethod('PUT', lam(pushTokenRegisterFn), withAuth);
    pushTokensRes.addMethod('DELETE', lam(pushTokenDeleteFn), withAuth);

    // トークン管理（要認証）
    const tokensRes = api.root.addResource('tokens');
    tokensRes.addMethod('POST', lam(tokenCreateFn), withAuth);
    tokensRes.addMethod('GET', lam(tokenListFn), withAuth);
    tokensRes.addResource('{token}').addMethod('DELETE', lam(tokenDeleteFn), withAuth);

    // エラー収集・閲覧
    const errorsRes = api.root.addResource('errors');
    errorsRes.addMethod('POST', lam(errorReportFn));
    errorsRes.addMethod('GET', lam(errorListFn), withAuth);

    // エラーダッシュボード
    const dashboardRes = api.root.addResource('dashboard');
    dashboardRes.addMethod('GET', lam(errorDashboardFn));

    // ダッシュボード用: api.url はデプロイステージへの参照を含み循環依存になるため、
    // restApiId から URL を組み立てて依存を断つ
    const apiBaseUrl = Fn.join('', ['https://', api.restApiId, '.execute-api.', this.region, '.amazonaws.com/v1/']);
    const dashboardUrl = Fn.join('', [
      'https://',
      api.restApiId,
      '.execute-api.',
      this.region,
      '.amazonaws.com/v1/dashboard',
    ]);

    // ダッシュボード用コールバック URL を Cognito に追加
    userPoolClientCfn.addPropertyOverride('CallbackURLs', [
      'http://localhost:17890/callback',
      'poi-notice://auth',
      dashboardUrl,
    ]);
    userPoolClientCfn.addPropertyOverride('LogoutURLs', [
      'http://localhost:17890/logout',
      'poi-notice://logout',
      dashboardUrl,
    ]);

    // ダッシュボード Lambda に Cognito 情報を渡す
    errorDashboardFn.addEnvironment('API_URL', apiBaseUrl);
    errorDashboardFn.addEnvironment('COGNITO_DOMAIN', userPoolDomain.domainName);

    // ----------------------------------------------------------------
    // Outputs
    // ----------------------------------------------------------------
    // プラグインが aws-outputs.json から読み込む値
    new CfnOutput(this, 'ApiUrl', { value: api.url });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClientCfn.ref });
    new CfnOutput(this, 'CognitoDomain', { value: userPoolDomain.domainName });
  }
}
