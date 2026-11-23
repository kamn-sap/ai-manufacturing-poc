const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3 } = require('../lib/aws');

const bucket = process.env.S3_BUCKET || 'manufacturing-documents';

function browserFileUrl(signedUrl) {
  const endpoint = new URL(process.env.AWS_ENDPOINT_URL || 'https://127.0.0.1:9297');
  if (!['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)) return signedUrl;

  const signed = new URL(signedUrl);
  const proxy = new URL(process.env.CORS_ORIGIN || 'http://localhost:5173');
  proxy.pathname = `/__local_s3${signed.pathname}`;
  proxy.search = signed.search;
  return proxy.toString();
}

async function createUploadUrl(key, contentType) {
  const signedUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 900 });
  return browserFileUrl(signedUrl);
}

async function createDownloadUrl(key) {
  const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
  return browserFileUrl(signedUrl);
}

async function getObjectBuffer(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`S3 returned an empty object for ${key}`);
  return Buffer.from(await response.Body.transformToByteArray());
}

module.exports = { browserFileUrl, createDownloadUrl, createUploadUrl, getObjectBuffer };
