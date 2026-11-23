const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3 } = require('../lib/aws');

const bucket = process.env.S3_BUCKET || 'manufacturing-documents';

async function createUploadUrl(key, contentType) {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 900 });
}

async function createDownloadUrl(key) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
}

async function getObjectBuffer(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`S3 returned an empty object for ${key}`);
  return Buffer.from(await response.Body.transformToByteArray());
}

module.exports = { createDownloadUrl, createUploadUrl, getObjectBuffer };
