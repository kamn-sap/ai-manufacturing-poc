const { GetCommand, PutCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('./aws');

async function saveReviewSession(session) {
  await dynamo.send(new PutCommand({ TableName: 'ReviewSessions', Item: session }));
  return session;
}

async function getReviewSession(id) {
  const result = await dynamo.send(new GetCommand({ TableName: 'ReviewSessions', Key: { id } }));
  return result.Item || null;
}

async function listFindings(sessionId) {
  const findings = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: 'ReviewFindings',
      FilterExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: { ':sessionId': sessionId },
      ExclusiveStartKey,
    }));
    findings.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return findings;
}

async function saveFinding(finding) {
  await dynamo.send(new PutCommand({ TableName: 'ReviewFindings', Item: finding }));
  return finding;
}

async function updateFinding(id, fields) {
  const entries = Object.entries(fields);
  const names = Object.fromEntries(entries.map(([key], index) => [`#field${index}`, key]));
  const values = Object.fromEntries(entries.map(([, value], index) => [`:value${index}`, value]));
  const updateExpression = entries.map((_, index) => `#field${index} = :value${index}`).join(', ');
  const result = await dynamo.send(new UpdateCommand({
    TableName: 'ReviewFindings',
    Key: { id },
    UpdateExpression: `SET ${updateExpression}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

module.exports = { getReviewSession, listFindings, saveFinding, saveReviewSession, updateFinding };
