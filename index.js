const { Client, GatewayIntentBits, Collection } = require('discord.js');
const voiceTracker = require('./events/voiceTracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TEXT_CHANNEL_ID = '1451012983219032064';

client.commands = new Collection();
client.commands.set('horario', require('./commands/horario'));

client.once('clientReady', () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);
});

client.on('voiceStateUpdate', (o, n) =>
  voiceTracker(client, o, n, TEXT_CHANNEL_ID)
);

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
});

console.log('TOKEN =>', process.env.TOKEN ? 'EXISTE' : 'NO EXISTE');
client.login(process.env.TOKEN);
