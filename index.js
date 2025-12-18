const { Client, GatewayIntentBits } = require('discord.js');

if (!process.env.TOKEN) {
  console.error('❌ TOKEN NO EXISTE');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// 👉 CAMBIA ESTE ID POR TU CANAL DE TEXTO
const TEXT_CHANNEL_ID = '1451012983219032064';

// Guardamos cuándo entra cada usuario
const voiceSessions = new Map();

client.once('ready', () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id;
  const username = newState.member?.user.username;

  // 🟢 Entró a un canal de voz
  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, {
      channel: newState.channel.name,
      joinedAt: new Date()
    });
    return;
  }

  // 🔴 Salió del canal de voz
  if (oldState.channelId && !newState.channelId) {
    const session = voiceSessions.get(userId);
    if (!session) return;

    const leftAt = new Date();
    const durationMs = leftAt - session.joinedAt;

    const seconds = Math.floor(durationMs / 1000) % 60;
    const minutes = Math.floor(durationMs / (1000 * 60)) % 60;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));

    const message = `
👤 **Usuario:** ${username}
🎧 **Canal:** ${session.channel}
📅 **Conectó:** ${session.joinedAt.toLocaleString()}
📅 **Desconectó:** ${leftAt.toLocaleString()}
⏱ **Tiempo conectado:** ${hours}h ${minutes}m ${seconds}s
    `;

    try {
      const textChannel = await client.channels.fetch(TEXT_CHANNEL_ID);
      textChannel.send(message);
    } catch (err) {
      console.error('❌ Error enviando mensaje:', err.message);
    }

    voiceSessions.delete(userId);
  }
});

client.login(process.env.TOKEN);
