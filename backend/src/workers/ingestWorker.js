require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
const { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand } = require('@aws-sdk/client-sqs');
const { sqs } = require('../lib/aws');
const { getDocument, updateDocument } = require('../lib/documents');
const { ingestDocument } = require('../services/ingest');

async function queueUrl() {
  if (process.env.DOC_INGEST_QUEUE_URL) return process.env.DOC_INGEST_QUEUE_URL;
  const result = await sqs.send(new GetQueueUrlCommand({ QueueName: 'doc-ingest-queue' }));
  return result.QueueUrl;
}

async function processMessage(message) {
  const { documentId } = JSON.parse(message.Body);
  let document;
  try {
    document = await getDocument(documentId);
    if (!document) throw new Error(`Document ${documentId} does not exist`);
    await updateDocument(documentId, { status: 'processing', updatedAt: new Date().toISOString() });
    const result = await ingestDocument(document);
    await updateDocument(documentId, {
      status: 'ready',
      chunkCount: result.chunkCount,
      ingestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Document ingestion failed for ${documentId}:`, error);
    if (document) {
      await updateDocument(documentId, {
        status: 'failed',
        error: error.message,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

async function runWorker() {
  const url = await queueUrl();
  console.log('Document ingestion worker is polling SQS');
  while (true) {
    const response = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: url,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 120,
    }));
    for (const message of response.Messages || []) {
      await processMessage(message);
      await sqs.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: message.ReceiptHandle }));
    }
  }
}

if (require.main === module) {
  runWorker().catch((error) => {
    console.error('Document ingestion worker stopped:', error);
    process.exitCode = 1;
  });
}

module.exports = { processMessage, runWorker };
