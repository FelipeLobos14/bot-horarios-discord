const { formatDuration } = require('../utils/time');
const storage = require('../utils/storage');

module.exports = async (client, oldState, newState, TEXT_CHANNEL_ID) => {
  const userId = newState.id;

  // ENTRA
  if (!oldState.channel && newState.channel) {
    storage.addActiveUser(userId, {
      channel: newState.channel.name,
      join: new Date()
    });
  }

  // SALE
  if (oldState.channel && !newState.channel) {
    const data = storage.removeActiveUser(userId);
    if (!data) return;

    const leave = new Date();
    const duration = leave - data.join;

    storage.saveSession(userId, {
      channel: data.channel,
      join: data.join,
      leave,
      duration
    });

    const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
    channel.send(
      `🕒 **${newState.member.user.tag}**
🎧 ${data.channel}
⏱ ${formatDuration(duration)}`
    );
  }
};
