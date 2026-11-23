import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  Tags,
} from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

interface FoundationStackProps extends StackProps {
  stage: string;
  appOrigin: string;
}

function validateOrigin(origin: string, stage: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('appOrigin must be an HTTP or HTTPS origin');
  }
  const normalizedOrigin = origin.replace(/\/$/, '');
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.origin !== normalizedOrigin
  ) {
    throw new Error('appOrigin must not include a path, query, or fragment');
  }
  if (stage === 'prod' && parsed.protocol !== 'https:') {
    throw new Error('The production appOrigin must use HTTPS');
  }
  return parsed.origin;
}

export class FoundationStack extends Stack {
  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const appOrigin = validateOrigin(props.appOrigin, stage);
    const resourcePrefix = `ai-mfg-poc-${stage}`;
    const retained = { removalPolicy: RemovalPolicy.RETAIN };

    Tags.of(this).add('Project', 'ai-manufacturing-poc');
    Tags.of(this).add('Environment', stage);
    Tags.of(this).add('ManagedBy', 'aws-cdk');

    const documentsBucket = new Bucket(this, 'DocumentsBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      ...retained,
    });
    documentsBucket.addCorsRule({
      allowedOrigins: [appOrigin],
      allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
      allowedHeaders: ['*'],
      exposedHeaders: ['ETag'],
      maxAge: Duration.hours(1).toSeconds(),
    });

    const createTable = (id: string, tableName: string, partitionKey: string) => new Table(this, id, {
      tableName,
      partitionKey: { name: partitionKey, type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      ...retained,
    });

    const usersTable = createTable('UsersTable', `${resourcePrefix}-users`, 'username');
    const documentsTable = createTable('DocumentsTable', `${resourcePrefix}-documents`, 'id');
    const reviewSessionsTable = createTable(
      'ReviewSessionsTable',
      `${resourcePrefix}-review-sessions`,
      'id',
    );
    const reviewFindingsTable = createTable(
      'ReviewFindingsTable',
      `${resourcePrefix}-review-findings`,
      'id',
    );

    const documentIngestQueue = new Queue(this, 'DocumentIngestQueue', {
      queueName: `${resourcePrefix}-doc-ingest`,
      encryption: QueueEncryption.SQS_MANAGED,
      receiveMessageWaitTime: Duration.seconds(20),
      visibilityTimeout: Duration.seconds(120),
      ...retained,
    });

    new CfnOutput(this, 'StageName', { value: stage });
    new CfnOutput(this, 'DocumentsBucketName', { value: documentsBucket.bucketName });
    new CfnOutput(this, 'UsersTableName', { value: usersTable.tableName });
    new CfnOutput(this, 'DocumentsTableName', { value: documentsTable.tableName });
    new CfnOutput(this, 'ReviewSessionsTableName', { value: reviewSessionsTable.tableName });
    new CfnOutput(this, 'ReviewFindingsTableName', { value: reviewFindingsTable.tableName });
    new CfnOutput(this, 'DocumentIngestQueueUrl', { value: documentIngestQueue.queueUrl });
    new CfnOutput(this, 'AppOrigin', { value: appOrigin });
  }
}
