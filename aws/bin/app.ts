#!/usr/bin/env node
import 'aws-cdk-lib/aws-lambda';
import { App } from 'aws-cdk-lib';
import { PoiWebhookStack } from '../lib/poi-webhook-stack';

const app = new App();

new PoiWebhookStack(app, 'PoiWebhookStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
