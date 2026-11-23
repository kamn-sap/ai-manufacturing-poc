import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.SQLITE_PATH = ':memory:';
const aws = require('./aws');
const { hashPassword } = require('./passwords');
const testUsers = new Map([
  ['operator', { username: 'operator', ...hashPassword('change-me') }],
  ['reviewer', { username: 'reviewer', ...hashPassword('reviewer-secret') }],
]);
aws.dynamo.send = async (command) => ({ Item: testUsers.get(command.input.Key.username) });
const app = require('../server');

describe('JWT authentication boundary', () => {
  it('rejects protected knowledge routes without a token', async () => {
    const response = await request(app).get('/api/knowledge');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('認証');
  });

  it('rejects invalid login credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('authenticates distinct users from the DynamoDB user records', async () => {
    const [operator, reviewer] = await Promise.all(['operator', 'reviewer'].map((username) => (
      request(app)
        .post('/api/auth/login')
        .send({ username, password: username === 'operator' ? 'change-me' : 'reviewer-secret' })
    )));

    expect(operator.body.username).toBe('operator');
    expect(reviewer.body.username).toBe('reviewer');
    expect(operator.body.token).not.toBe(reviewer.body.token);
  });

  it('does not use an LLM when the knowledge index has no matching evidence', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'change-me' });
    const previousProvider = process.env.LLM_PROVIDER;
    let response;
    try {
      process.env.LLM_PROVIDER = 'unconfigured-test-provider';
      response = await request(app)
        .post('/api/knowledge/ask')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ question: '試験用の未登録質問 918273' });
    } finally {
      if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = previousProvider;
    }

    expect(response.status).toBe(200);
    expect(response.body.answer).toContain('該当資料を確認できません');
    expect(response.body.citations).toEqual([]);
  });
});
