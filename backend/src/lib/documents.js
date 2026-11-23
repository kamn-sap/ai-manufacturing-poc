const { GetCommand, PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('./aws');

const TABLE = 'Documents';

async function getDocument(id) {
  const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return result.Item || null;
}

async function saveDocument(document) {
  await dynamo.send(new PutCommand({ TableName: TABLE, Item: document }));
  return document;
}

async function updateDocument(id, fields) {
  const entries = Object.entries(fields);
  const names = Object.fromEntries(entries.map(([key], index) => [`#field${index}`, key]));
  const values = Object.fromEntries(entries.map(([, value], index) => [`:value${index}`, value]));
  const updateExpression = entries.map((_, index) => `#field${index} = :value${index}`).join(', ');
  const result = await dynamo.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpression}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

async function listDocuments() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

module.exports = { getDocument, listDocuments, saveDocument, updateDocument };
