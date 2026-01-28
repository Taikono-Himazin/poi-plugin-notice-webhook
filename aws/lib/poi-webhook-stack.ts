import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration, CfnParameter, CfnCondition, Fn } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb      from 'aws-cdk-lib/aws-dynamodb'
import * as lambda        from 'aws-cdk-lib/aws-lambda'
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigateway    from 'aws-cdk-lib/aws-apigateway'
import * as cognito       from 'aws-cdk-lib/aws-cognito'
import * as iam           from 'aws-cdk-lib/aws-iam'
import * as path          from 'path'

export class PoiWebhookStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // ----------------------------------------------------------------
    // デプロイ時パラメータ
    // ----------------------------------------------------------------
    const payjpSecretKeyParam = new CfnParameter(this, 'PayjpSecretKey', {
      type: 'String', noEcho: true,
      description: 'PAY.JP シークレットキー (sk_live_... or sk_test_...)',
    })
    const payjpPublicKeyParam = new CfnParameter(this, 'PayjpPublicKey', {
      type: 'String',
      description: 'PAY.JP 公開キー (pk_live_... or pk_test_...)',
    })
    const payjpWebhookSecretParam = new CfnParameter(this, 'PayjpWebhookSecret', {
      type: 'String', noEcho: true,
      description: 'PAY.JP Webhook 署名シークレット',
    })
    const payjpPrice1mParam = new CfnParameter(this, 'PayjpPrice1m', {
      type: 'String',
      description: 'PAY.JP v2 価格 ID — 1ヶ月プラン (prc_...)',
    })
    const payjpPrice6mParam = new CfnParameter(this, 'PayjpPrice6m', {
      type: 'String',
      description: 'PAY.JP v2 価格 ID — 6ヶ月プラン (prc_...)',
    })
    const payjpPrice12mParam = new CfnParameter(this, 'PayjpPrice12m', {
      type: 'String',
      description: 'PAY.JP v2 価格 ID — 12ヶ月プラン (prc_...)',
    })

    const googleClientIdParam = new CfnParameter(this, 'GoogleClientId', {
      type: 'String', default: '',
      description: 'Google OAuth 2.0 クライアント ID（空白でスキップ）',
    })
    const googleClientSecretParam = new CfnParameter(this, 'GoogleClientSecret', {
      type: 'String', noEcho: true, default: '',
      description: 'Google OAuth 2.0 クライアントシークレット',
    })

    // ----------------------------------------------------------------
    // Cognito User Pool + Managed Login
    // ----------------------------------------------------------------
    const hasGoogle = new CfnCondition(this, 'HasGoogleCredentials', {
      expression: Fn.conditionNot(Fn.conditionEquals(googleClientIdParam.valueAsString, '')),
    })

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
    })

    // Cognito Managed Login ドメイン
    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `poi-webhook-${this.account}` },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    })

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
    })
    googleIdP.cfnOptions.condition = hasGoogle

    // User Pool Client（L1 — Google を条件付きでサポート）
    const userPoolClientCfn = new cognito.CfnUserPoolClient(this, 'UserPoolClient', {
      userPoolId: userPool.userPoolId,
      clientName: 'WebClient',
      generateSecret: false,
      explicitAuthFlows: [
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
      allowedOAuthFlows: ['code'],
      allowedOAuthScopes: ['openid', 'email', 'profile'],
      allowedOAuthFlowsUserPoolClient: true,
      callbackUrLs: ['http://localhost:17890/callback'],
      logoutUrLs: ['http://localhost:17890/logout'],
    })
    userPoolClientCfn.addPropertyOverride(
      'SupportedIdentityProviders',
      Fn.conditionIf('HasGoogleCredentials', ['COGNITO', 'Google'], ['COGNITO']),
    )

    // Managed Login ブランディング（Cognito デフォルトスタイルを使用）
    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId:   userPoolClientCfn.ref,
      useCognitoProvidedValues: true,
    })

    // ----------------------------------------------------------------
    // DynamoDB テーブル
    // ----------------------------------------------------------------
    const accountsTable = new dynamodb.Table(this, 'AccountsTable', {
      tableName: 'poi-webhook-accounts',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const tokensTable = new dynamodb.Table(this, 'TokensTable', {
      tableName: 'poi-webhook-tokens',
      partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    tokensTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    })

    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: 'poi-webhook-notifications',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // タイマー状態テーブル（userId: PK, pk: SK = "type#slot"）
    const timersTable = new dynamodb.Table(this, 'TimersTable', {
      tableName: 'poi-webhook-timers',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'pk',     type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // ----------------------------------------------------------------
    // Lambda 共通設定
    // ----------------------------------------------------------------
    const srcDir = path.join(__dirname, '..', 'src')

    const commonEnv: Record<string, string> = {
      ACCOUNTS_TABLE:       accountsTable.tableName,
      TOKENS_TABLE:         tokensTable.tableName,
      NOTIFICATIONS_TABLE:  notificationsTable.tableName,
      TIMERS_TABLE:         timersTable.tableName,
      USER_POOL_ID:         userPool.userPoolId,
      USER_POOL_CLIENT_ID:  userPoolClientCfn.ref,
      PAYJP_SECRET_KEY:     payjpSecretKeyParam.valueAsString,
      PAYJP_PUBLIC_KEY:     payjpPublicKeyParam.valueAsString,
      PAYJP_WEBHOOK_SECRET: payjpWebhookSecretParam.valueAsString,
    }

    const fn = (id: string, entry: string, extraEnv: Record<string, string> = {}) =>
      new lambda_nodejs.NodejsFunction(this, id, {
        functionName: `poi-webhook-${id.replace(/Function$/, '').toLowerCase()}`,
        entry: path.join(srcDir, entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(30),
        memorySize: 256,
        bundling: { minify: true, sourceMap: false },
        environment: { ...commonEnv, ...extraEnv },
      })

    // ----------------------------------------------------------------
    // Lambda 関数
    // ----------------------------------------------------------------

    // 遅延配信
    const deliverFn = fn('DeliverFunction', 'deliver/index.js')
    notificationsTable.grantReadWriteData(deliverFn)
    accountsTable.grantReadData(deliverFn)

    // EventBridge Scheduler 用 IAM ロール
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      inlinePolicies: {
        InvokeLambda: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [deliverFn.functionArn],
          })],
        }),
      },
    })

    // 通知受信（認証不要 — トークンが認証の役割）
    const ingestFn = fn('IngestFunction', 'ingest/index.js', {
      DELIVER_FUNCTION_ARN: deliverFn.functionArn,
      SCHEDULER_ROLE_ARN:   schedulerRole.roleArn,
    })
    tokensTable.grantReadData(ingestFn)
    accountsTable.grantReadWriteData(ingestFn)
    notificationsTable.grantReadWriteData(ingestFn)
    ingestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule'],
      resources: ['*'],
    }))
    ingestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn],
    }))

    // アカウント設定（Cognito 認証）
    const accountConfigFn = fn('AccountConfigFunction', 'account/config.js')
    accountsTable.grantReadWriteData(accountConfigFn)

    // トークン管理（要認証）— 既存クライアントとの互換性のために残す
    const tokenCreateFn = fn('TokenCreateFunction', 'tokens/create.js')
    tokensTable.grantReadWriteData(tokenCreateFn)
    accountsTable.grantReadData(tokenCreateFn)

    const tokenListFn = fn('TokenListFunction', 'tokens/list.js')
    tokensTable.grantReadData(tokenListFn)

    const tokenDeleteFn = fn('TokenDeleteFunction', 'tokens/delete.js')
    tokensTable.grantReadWriteData(tokenDeleteFn)

    // 請求
    const checkoutFn = fn('CheckoutFunction', 'billing/checkout.js', {
      PAYJP_PRICE_1M:  payjpPrice1mParam.valueAsString,
      PAYJP_PRICE_6M:  payjpPrice6mParam.valueAsString,
      PAYJP_PRICE_12M: payjpPrice12mParam.valueAsString,
    })
    accountsTable.grantReadWriteData(checkoutFn)

    const payCompleteFn = fn('PayCompleteFunction', 'billing/pay-complete.js')

    const billingStatusFn = fn('BillingStatusFunction', 'billing/status.js')
    accountsTable.grantReadData(billingStatusFn)

    const trialFn = fn('TrialFunction', 'billing/trial.js')
    accountsTable.grantReadWriteData(trialFn)

    // タイマー同期（Cognito 認証）
    const timerSyncFn = fn('TimerSyncFunction', 'timers/sync.js', {
      DELIVER_FUNCTION_ARN: deliverFn.functionArn,
      SCHEDULER_ROLE_ARN:   schedulerRole.roleArn,
    })
    accountsTable.grantReadData(timerSyncFn)
    notificationsTable.grantReadWriteData(timerSyncFn)
    timersTable.grantReadWriteData(timerSyncFn)
    timerSyncFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
      resources: ['*'],
    }))
    timerSyncFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn],
    }))

    // 有料プラン期限切れ通知
    const expiryNotifyFn = fn('ExpiryNotifyFunction', 'billing/expiry-notify.js')
    accountsTable.grantReadData(expiryNotifyFn)

    // 期限切れ通知用 Scheduler ロール
    const expirySchedulerRole = new iam.Role(this, 'ExpirySchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      inlinePolicies: {
        InvokeExpiryNotify: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [expiryNotifyFn.functionArn],
          })],
        }),
      },
    })

    // PAY.JP Webhook
    const payjpWebhookFn = fn('PayjpWebhookFunction', 'payjp/webhook.js', {
      EXPIRY_NOTIFY_FUNCTION_ARN: expiryNotifyFn.functionArn,
      EXPIRY_SCHEDULER_ROLE_ARN:  expirySchedulerRole.roleArn,
    })
    accountsTable.grantReadWriteData(payjpWebhookFn)
    payjpWebhookFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
      resources: ['*'],
    }))
    payjpWebhookFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [expirySchedulerRole.roleArn],
    }))

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
    })

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    })
    const withAuth: Partial<apigateway.MethodOptions> = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    }
    const lam = (f: lambda.IFunction) => new apigateway.LambdaIntegration(f)

    // 通知受信（認証不要 — トークンが認証の役割）
    api.root
      .addResource('webhooks')
      .addResource('{token}')
      .addMethod('POST', lam(ingestFn))

    // タイマー同期（Cognito 認証）
    api.root
      .addResource('timers')
      .addMethod('PUT', lam(timerSyncFn), withAuth)

    // アカウント設定（Cognito 認証）
    const accountConfigRes = api.root
      .addResource('account')
      .addResource('config')
    accountConfigRes.addMethod('GET', lam(accountConfigFn), withAuth)
    accountConfigRes.addMethod('PUT', lam(accountConfigFn), withAuth)

    // トークン管理（要認証）
    const tokensRes = api.root.addResource('tokens')
    tokensRes.addMethod('POST', lam(tokenCreateFn), withAuth)
    tokensRes.addMethod('GET',  lam(tokenListFn),   withAuth)
    tokensRes.addResource('{token}').addMethod('DELETE', lam(tokenDeleteFn), withAuth)

    // 請求（要認証）
    const billingRes = api.root.addResource('billing')
    billingRes.addResource('checkout').addMethod('GET',  lam(checkoutFn),      withAuth)
    billingRes.addResource('status').addMethod('GET',    lam(billingStatusFn), withAuth)
    billingRes.addResource('trial').addMethod('POST',          lam(trialFn),         withAuth)
    billingRes.addResource('pay-complete').addMethod('GET',    lam(payCompleteFn))

    // checkout に API_URL を設定（api.restApiId はステージ依存なし → 循環依存を回避）
    checkoutFn.addEnvironment(
      'API_URL',
      `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/v1/`,
    )

    // PAY.JP Webhook（認証不要、署名検証）
    api.root
      .addResource('payjp')
      .addResource('webhook')
      .addMethod('POST', lam(payjpWebhookFn))

    // ----------------------------------------------------------------
    // Outputs
    // ----------------------------------------------------------------
    // プラグインが aws-outputs.json から読み込む値
    new CfnOutput(this, 'ApiUrl',           { value: api.url })
    new CfnOutput(this, 'UserPoolId',       { value: userPool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClientCfn.ref })
    new CfnOutput(this, 'CognitoDomain',    { value: userPoolDomain.domainName })
    // セットアップ時の参照用
    new CfnOutput(this, 'PayjpWebhookUrl',  {
      value: `${api.url}payjp/webhook`,
      description: 'PAY.JP ダッシュボードに登録する Webhook URL',
    })
  }
}
