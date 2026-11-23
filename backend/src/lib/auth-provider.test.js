import { describe, expect, it, vi } from 'vitest';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthChallengeRequiredError,
  createCognitoAuthProvider,
} from './auth.js';

describe('Cognito auth provider', () => {
  it('uses the password auth flow and returns a verified ID token session', async () => {
    const cognitoClient = {
      send: vi.fn(async () => ({
        AuthenticationResult: { IdToken: 'id-token' },
      })),
    };
    const verifier = {
      verify: vi.fn(async () => ({ sub: 'user-id', 'cognito:username': 'operator' })),
    };
    const provider = createCognitoAuthProvider({
      userPoolId: 'ap-northeast-1_example',
      clientId: 'client-id',
      cognitoClient,
      verifier,
    });

    const result = await provider.authenticate('operator', 'password');
    const command = cognitoClient.send.mock.calls[0][0];

    expect(command).toBeInstanceOf(InitiateAuthCommand);
    expect(command.input).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-id',
      AuthParameters: { USERNAME: 'operator', PASSWORD: 'password' },
    });
    expect(verifier.verify).toHaveBeenCalledWith('id-token');
    expect(result).toEqual({ token: 'id-token', username: 'operator' });
  });

  it('reports Cognito challenges instead of treating them as successful logins', async () => {
    const provider = createCognitoAuthProvider({
      userPoolId: 'ap-northeast-1_example',
      clientId: 'client-id',
      cognitoClient: {
        async send() {
          return { ChallengeName: 'SMS_MFA' };
        },
      },
      verifier: { verify: vi.fn() },
    });

    await expect(provider.authenticate('operator', 'password'))
      .rejects.toBeInstanceOf(AuthChallengeRequiredError);
  });

  it('returns no session for invalid Cognito credentials', async () => {
    const provider = createCognitoAuthProvider({
      userPoolId: 'ap-northeast-1_example',
      clientId: 'client-id',
      cognitoClient: {
        async send() {
          const error = new Error('Invalid credentials');
          error.name = 'NotAuthorizedException';
          throw error;
        },
      },
      verifier: { verify: vi.fn() },
    });

    await expect(provider.authenticate('operator', 'wrong-password')).resolves.toBeNull();
  });
});
