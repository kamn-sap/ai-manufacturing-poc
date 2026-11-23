import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FoundationStack } from './lib/foundation-stack.js';

function createTemplate(stage = 'test', appOrigin = 'https://app.example.com') {
  const app = new App();
  const stack = new FoundationStack(app, 'TestStack', { stage, appOrigin });
  return Template.fromStack(stack);
}

describe('FoundationStack', () => {
  it('synthesizes the storage, database, and ingestion queue used by the app', () => {
    const template = createTemplate();

    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.resourceCountIs('AWS::DynamoDB::Table', 4);
    template.resourceCountIs('AWS::SQS::Queue', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      TableName: 'ai-mfg-poc-test-documents',
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'ai-mfg-poc-test-doc-ingest',
      ReceiveMessageWaitTimeSeconds: 20,
      VisibilityTimeout: 120,
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      CorsConfiguration: {
        CorsRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedOrigins: ['https://app.example.com'],
          ExposedHeaders: ['ETag'],
          MaxAge: 3600,
        }],
      },
    });
  }, 30_000);

  it('retains data resources when the stack is removed', () => {
    const template = createTemplate();
    template.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    template.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
    template.hasResource('AWS::SQS::Queue', { DeletionPolicy: 'Retain' });
  });

  it('requires HTTPS for the production application origin', () => {
    expect(() => createTemplate('prod', 'http://app.example.com')).toThrow(
      'The production appOrigin must use HTTPS',
    );
  });

  it('rejects origins that contain paths', () => {
    expect(() => createTemplate('test', 'https://app.example.com/path')).toThrow(
      'appOrigin must not include a path, query, or fragment',
    );
  });
});
