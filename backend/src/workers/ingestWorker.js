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

function createMessageProcessor({
  getDocumentFn = getDocument,
  updateDocumentFn = updateDocument,
  ingestDocumentFn = ingestDocument,
} = {}) {
  return async function processMessage(message) {
    const { documentId } = JSON.parse(message.Body);
    let document;
    try {
      document = await getDocumentFn(documentId);
      if (!document) throw new Error(`Document ${documentId} does not exist`);
      await updateDocumentFn(documentId, { status: 'processing', updatedAt: new Date().toISOString() });
      const result = await ingestDocumentFn(document);
      await updateDocumentFn(documentId, {
        status: 'ready',
        chunkCount: result.chunkCount,
        ingestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (document) {
        try {
          await updateDocumentFn(documentId, {
            status: 'failed',
            error: error.message,
            updatedAt: new Date().toISOString(),
          });
        } catch (stateError) {
          console.error(`Failed to update document ${documentId} after ingestion failure:`, stateError);
        }
      }
      throw error;
    }
  };
}

const processMessage = createMessageProcessor();

async function handleMessage(message, queueUrl, {
  process = processMessage,
  deleteMessage = (url, receiptHandle) => sqs.send(new DeleteMessageCommand({
    QueueUrl: url,
    ReceiptHandle: receiptHandle,
  })),
} = {}) {
  await process(message);
  await deleteMessage(queueUrl, message.ReceiptHandle);
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
      try {
        await handleMessage(message, url);
      } catch (error) {
        console.error(`SQS message ${message.MessageId || '(unknown)'} failed and will be retried:`, error);
      }
    }
  }
}

if (require.main === module) {
  runWorker().catch((error) => {
    console.error('Document ingestion worker stopped:', error);
    process.exitCode = 1;
  });
}

module.exports = { createMessageProcessor, handleMessage, processMessage, runWorker };
