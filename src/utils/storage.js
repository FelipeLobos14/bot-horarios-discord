// Estructura:
// userId -> [{ join, leave, duration }]
const voiceHistory = new Map();
const activeUsers = new Map();

function addActiveUser(userId, data) {
  activeUsers.set(userId, data);
}

function removeActiveUser(userId) {
  return activeUsers.get(userId);
}

function saveSession(userId, session) {
  if (!voiceHistory.has(userId)) {
    voiceHistory.set(userId, []);
  }
  voiceHistory.get(userId).push(session);
}

function getUserHistory(userId) {
  return voiceHistory.get(userId) || [];
}

module.exports = {
  addActiveUser,
  removeActiveUser,
  saveSession,
  getUserHistory,
  activeUsers
};
