import { describe, expect, it, vi } from 'vitest';

const { createMessageProcessor, handleMessage } = require('./ingestWorker');

describe('document ingestion worker retries', () => {
  it('marks a failed document and rethrows so SQS can retry it', async () => {
    const updateDocumentFn = vi.fn().mockResolvedValue(undefined);
    const processor = createMessageProcessor({
      getDocumentFn: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      updateDocumentFn,
      ingestDocumentFn: vi.fn().mockRejectedValue(new Error('temporary storage error')),
    });

    await expect(processor({ Body: JSON.stringify({ documentId: 'doc-1' }) }))
      .rejects.toThrow('temporary storage error');
    expect(updateDocumentFn.mock.calls.map(([, fields]) => fields.status)).toEqual([
      'processing',
      'failed',
    ]);
  });

  it('does not delete a message when processing fails', async () => {
    const deleteMessage = vi.fn();

    await expect(handleMessage(
      { Body: '{}', ReceiptHandle: 'receipt-1' },
      'queue-url',
      {
        process: vi.fn().mockRejectedValue(new Error('processing failed')),
        deleteMessage,
      },
    )).rejects.toThrow('processing failed');

    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it('deletes a message after successful processing', async () => {
    const deleteMessage = vi.fn().mockResolvedValue(undefined);

    await handleMessage(
      { Body: '{}', ReceiptHandle: 'receipt-1' },
      'queue-url',
      { process: vi.fn().mockResolvedValue(undefined), deleteMessage },
    );

    expect(deleteMessage).toHaveBeenCalledWith('queue-url', 'receipt-1');
  });
});
