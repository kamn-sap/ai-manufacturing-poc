const fs = require('node:fs');
const https = require('node:https');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const endpoint = process.env.AWS_ENDPOINT_URL;
const region = process.env.AWS_REGION || 'us-east-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
  throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together');
}
const credentials = accessKeyId
  ? {
    accessKeyId,
    secretAccessKey,
    ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
  }
  : undefined;
const caBundle = process.env.AWS_CA_BUNDLE || process.env.NODE_EXTRA_CA_CERTS;
function requestHandler() {
  return new NodeHttpHandler({
    ...(caBundle ? { httpsAgent: new https.Agent({ ca: fs.readFileSync(caBundle) }) } : {}),
  });
}
const clientConfig = {
  region,
  ...(endpoint ? { endpoint } : {}),
  credentials,
  disableHostPrefix: true,
};
const dynamoClient = new DynamoDBClient({ ...clientConfig, requestHandler: requestHandler() });

module.exports = {
  dynamo: DynamoDBDocumentClient.from(dynamoClient),
  s3: new S3Client({ ...clientConfig, forcePathStyle: true, requestHandler: requestHandler() }),
  sqs: new SQSClient({ ...clientConfig, requestHandler: requestHandler() }),
};
