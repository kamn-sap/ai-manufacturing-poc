const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('../lib/aws');

async function findUser(username) {
  const result = await dynamo.send(new GetCommand({
    TableName: 'Users',
    Key: { username },
  }));
  return result.Item || null;
}

module.exports = { findUser };
