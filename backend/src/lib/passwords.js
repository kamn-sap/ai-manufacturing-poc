const crypto = require('node:crypto');

const HASH_BYTES = 64;

function normalizeUsername(username) {
  if (typeof username !== 'string') return null;
  const normalized = username.trim().toLowerCase();
  return normalized && normalized.length <= 128 ? normalized : null;
}

function hashPassword(password) {
  if (typeof password !== 'string' || !password.length) {
    throw new TypeError('Password must be a non-empty string');
  }
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, passwordSalt, HASH_BYTES).toString('hex');
  return { passwordSalt, passwordHash };
}

function verifyPassword(password, user) {
  if (
    typeof password !== 'string'
    || !/^[\da-f]{32}$/i.test(user?.passwordSalt || '')
    || !/^[\da-f]{128}$/i.test(user?.passwordHash || '')
  ) {
    return false;
  }
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = crypto.scryptSync(password, user.passwordSalt, HASH_BYTES);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, normalizeUsername, verifyPassword };
