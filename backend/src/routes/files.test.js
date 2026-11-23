import { describe, expect, it } from 'vitest';

const { browserFileUrl } = require('./files');

describe('browserFileUrl', () => {
  it('proxies loopback emulator URLs through the configured frontend origin', () => {
    const previousEndpoint = process.env.AWS_ENDPOINT_URL;
    const previousOrigin = process.env.CORS_ORIGIN;
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    try {
      expect(browserFileUrl('https://127.0.0.1:9297/bucket/key?signature=value')).toBe(
        'http://localhost:5173/__local_s3/bucket/key?signature=value',
      );
    } finally {
      if (previousEndpoint === undefined) delete process.env.AWS_ENDPOINT_URL;
      else process.env.AWS_ENDPOINT_URL = previousEndpoint;
      if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previousOrigin;
    }
  });

  it('keeps remote S3 URLs direct', () => {
    const previousEndpoint = process.env.AWS_ENDPOINT_URL;
    process.env.AWS_ENDPOINT_URL = 'https://s3.ap-northeast-1.amazonaws.com';

    try {
      const signedUrl = 'https://bucket.s3.ap-northeast-1.amazonaws.com/key?signature=value';
      expect(browserFileUrl(signedUrl)).toBe(signedUrl);
    } finally {
      if (previousEndpoint === undefined) delete process.env.AWS_ENDPOINT_URL;
      else process.env.AWS_ENDPOINT_URL = previousEndpoint;
    }
  });

  it('keeps standard AWS endpoint URLs direct when no custom endpoint is configured', () => {
    const previousEndpoint = process.env.AWS_ENDPOINT_URL;
    delete process.env.AWS_ENDPOINT_URL;

    try {
      const signedUrl = 'https://bucket.s3.ap-northeast-1.amazonaws.com/key?signature=value';
      expect(browserFileUrl(signedUrl)).toBe(signedUrl);
    } finally {
      if (previousEndpoint !== undefined) process.env.AWS_ENDPOINT_URL = previousEndpoint;
    }
  });
});
