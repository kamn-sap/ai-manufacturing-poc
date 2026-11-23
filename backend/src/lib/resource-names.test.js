import { describe, expect, it } from 'vitest';

const { getResourceNames } = require('./resource-names');

describe('AWS resource names', () => {
  it('uses local emulator defaults', () => {
    expect(getResourceNames({})).toEqual({
      users: 'Users',
      documents: 'Documents',
      reviewSessions: 'ReviewSessions',
      reviewFindings: 'ReviewFindings',
    });
  });

  it('uses configured deployment table names', () => {
    expect(getResourceNames({
      USERS_TABLE_NAME: 'poc-dev-users',
      DOCUMENTS_TABLE_NAME: 'poc-dev-documents',
      REVIEW_SESSIONS_TABLE_NAME: 'poc-dev-review-sessions',
      REVIEW_FINDINGS_TABLE_NAME: 'poc-dev-review-findings',
    })).toEqual({
      users: 'poc-dev-users',
      documents: 'poc-dev-documents',
      reviewSessions: 'poc-dev-review-sessions',
      reviewFindings: 'poc-dev-review-findings',
    });
  });
});
