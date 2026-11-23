function getResourceNames(env = process.env) {
  return {
    users: env.USERS_TABLE_NAME || 'Users',
    documents: env.DOCUMENTS_TABLE_NAME || 'Documents',
    reviewSessions: env.REVIEW_SESSIONS_TABLE_NAME || 'ReviewSessions',
    reviewFindings: env.REVIEW_FINDINGS_TABLE_NAME || 'ReviewFindings',
  };
}

module.exports = { getResourceNames };
