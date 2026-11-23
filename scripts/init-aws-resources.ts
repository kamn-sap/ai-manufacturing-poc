import 'dotenv/config';
import {
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { CreateQueueCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import aws from '../backend/src/lib/aws.js';
import passwordTools from '../backend/src/lib/passwords.js';

const { dynamo, s3, sqs } = aws;
const { hashPassword, normalizeUsername } = passwordTools;

async function createTableIfMissing(TableName, KeySchema, AttributeDefinitions) {
  try {
    await dynamo.send(new DescribeTableCommand({ TableName }));
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
    await dynamo.send(new CreateTableCommand({
      TableName,
      KeySchema,
      AttributeDefinitions,
      BillingMode: 'PAY_PER_REQUEST',
    }));
    console.log(`Created DynamoDB table ${TableName}`);
  }
  await waitUntilTableExists({
    client: dynamo,
    maxWaitTime: 60,
    minDelay: 1,
    maxDelay: 5,
  }, { TableName });
}

async function main() {
  const authProvider = process.env.AUTH_PROVIDER || 'local';
  if (!['local', 'cognito'].includes(authProvider)) {
    throw new Error(`AUTH_PROVIDER "${authProvider}" is not configured. Available providers: local, cognito`);
  }
  if (authProvider === 'local') {
    await createTableIfMissing('Users', [
      { AttributeName: 'username', KeyType: 'HASH' },
    ], [{ AttributeName: 'username', AttributeType: 'S' }]);
  }
  await createTableIfMissing('Documents', [
    { AttributeName: 'id', KeyType: 'HASH' },
  ], [{ AttributeName: 'id', AttributeType: 'S' }]);
  await createTableIfMissing('ReviewSessions', [
    { AttributeName: 'id', KeyType: 'HASH' },
  ], [{ AttributeName: 'id', AttributeType: 'S' }]);
  await createTableIfMissing('ReviewFindings', [
    { AttributeName: 'id', KeyType: 'HASH' },
  ], [{ AttributeName: 'id', AttributeType: 'S' }]);

  if (authProvider === 'local') {
    const configuredUsers = process.env.AUTH_USERS_JSON
      ? JSON.parse(process.env.AUTH_USERS_JSON)
      : [{
        username: process.env.AUTH_USERNAME || 'operator',
        password: process.env.AUTH_PASSWORD || 'change-me',
      }];
    if (!Array.isArray(configuredUsers) || configuredUsers.length === 0 || configuredUsers.length > 100) {
      throw new Error('AUTH_USERS_JSON must be an array containing 1 to 100 users');
    }
    const seededUsernames = new Set();
    for (const configuredUser of configuredUsers) {
      const username = normalizeUsername(configuredUser?.username);
      if (
        !username
        || typeof configuredUser.password !== 'string'
        || configuredUser.password.length < 8
        || configuredUser.password.length > 1024
        || seededUsernames.has(username)
      ) {
        throw new Error('Each configured user must have a unique username and a password of 8 to 1024 characters');
      }
      seededUsernames.add(username);
      await dynamo.send(new PutCommand({
        TableName: 'Users',
        Item: {
          username,
          ...hashPassword(configuredUser.password),
          createdAt: new Date().toISOString(),
        },
      }));
    }
  }

  const bucket = process.env.S3_BUCKET || 'manufacturing-documents';
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (error.name !== 'NotFound' && error.name !== 'NoSuchBucket') throw error;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created S3 bucket ${bucket}`);
  }
  await s3.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:5173'],
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }));

  const queueName = 'doc-ingest-queue';
  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  } catch (error) {
    if (error.name !== 'QueueDoesNotExist') throw error;
    await sqs.send(new CreateQueueCommand({
      QueueName: queueName,
      Attributes: { ReceiveMessageWaitTimeSeconds: '20', VisibilityTimeout: '120' },
    }));
    console.log(`Created SQS queue ${queueName}`);
  }
  console.log('AWS Emulator resources are ready');
}

main().catch((error) => {
  console.error('Failed to initialize AWS Emulator resources:', error);
  process.exitCode = 1;
});
