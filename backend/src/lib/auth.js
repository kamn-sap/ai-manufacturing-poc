const jwt = require('jsonwebtoken');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require('aws-jwt-verify/cognito-verifier');
const { JwtBaseError } = require('aws-jwt-verify/error');
const { findUser } = require('../services/users');
const { verifyPassword } = require('./passwords');

class AuthChallengeRequiredError extends Error {
  constructor(challengeName) {
    super(`Cognito authentication challenge required: ${challengeName}`);
    this.name = 'AuthChallengeRequiredError';
    this.challengeName = challengeName;
  }
}

function createLocalAuthProvider({
  userLookup = findUser,
  passwordVerifier = verifyPassword,
  secret = process.env.JWT_SECRET,
  nodeEnvironment = process.env.NODE_ENV,
} = {}) {
  if (!secret && nodeEnvironment === 'production') {
    throw new Error('JWT_SECRET is required when AUTH_PROVIDER=local in production');
  }
  const signingSecret = secret || 'local-development-secret';

  return {
    async authenticate(username, password) {
      const user = await userLookup(username);
      if (!user || !passwordVerifier(password, user)) return null;
      return {
        token: jwt.sign({ sub: user.username }, signingSecret, { expiresIn: '8h' }),
        username: user.username,
      };
    },
    async verifyToken(token) {
      try {
        return jwt.verify(token, signingSecret);
      } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) return null;
        throw error;
      }
    },
  };
}

function createCognitoAuthProvider({
  userPoolId = process.env.COGNITO_USER_POOL_ID,
  clientId = process.env.COGNITO_CLIENT_ID,
  region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-northeast-1',
  cognitoClient,
  verifier,
} = {}) {
  if (!userPoolId || !clientId) {
    throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required when AUTH_PROVIDER=cognito');
  }

  const client = cognitoClient || new CognitoIdentityProviderClient({ region });
  const tokenVerifier = verifier || CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: 'id',
  });

  return {
    async authenticate(username, password) {
      let response;
      try {
        response = await client.send(new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: { USERNAME: username, PASSWORD: password },
        }));
      } catch (error) {
        if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
          return null;
        }
        throw error;
      }

      if (response.ChallengeName) {
        throw new AuthChallengeRequiredError(response.ChallengeName);
      }
      const token = response.AuthenticationResult?.IdToken;
      if (!token) throw new Error('Cognito did not return an ID token');

      const claims = await tokenVerifier.verify(token);
      return {
        token,
        username: claims['cognito:username'] || claims.username || username,
      };
    },
    async verifyToken(token) {
      try {
        return await tokenVerifier.verify(token);
      } catch (error) {
        if (error instanceof JwtBaseError) return null;
        throw error;
      }
    },
  };
}

function createAuthProvider() {
  const providerName = process.env.AUTH_PROVIDER || 'local';
  if (providerName === 'local') return createLocalAuthProvider();
  if (providerName === 'cognito') return createCognitoAuthProvider();
  throw new Error(`AUTH_PROVIDER "${providerName}" is not configured. Available providers: local, cognito`);
}

const authProvider = createAuthProvider();

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: '認証が必要です。再度ログインしてください。' });

  authProvider.verifyToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: '認証が必要です。再度ログインしてください。' });
    req.user = user;
    return next();
  }).catch(next);
}

module.exports = {
  AuthChallengeRequiredError,
  authProvider,
  createAuthProvider,
  createCognitoAuthProvider,
  createLocalAuthProvider,
  requireAuth,
};
