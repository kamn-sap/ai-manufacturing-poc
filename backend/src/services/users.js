const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('../lib/aws');
const { getResourceNames } = require('../lib/resource-names');

const usersTable = getResourceNames().users;

async function findUser(username) {
  const result = await dynamo.send(new GetCommand({
    TableName: usersTable,
    Key: { username },
  }));
  return result.Item || null;
}

module.exports = { findUser };
