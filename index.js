const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

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

// 👉 TU CANAL DE TEXTO DONDE SE ENVIARÁN LOS LOGS
const TEXT_CHANNEL_ID = '1451012983219032064';

// Carpeta de Excel
const EXCEL_FOLDER = path.join(__dirname, 'estadisticas_excel');
if (!fs.existsSync(EXCEL_FOLDER)) fs.mkdirSync(EXCEL_FOLDER);

// Control de sesiones y duplicados
const voiceSessions = new Map();
const userStats = new Map();
const processingIds = new Set(); 

// Función para formatear fechas
function formatDate(date) {
  const options = {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  };
  const parts = new Intl.DateTimeFormat('es-CL', options).formatToParts(date);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

client.once('ready', async () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('horario')
      .setDescription('Muestra el historial de voz de un usuario')
      .addUserOption(option =>
        option.setName('usuario').setDescription('Usuario a consultar').setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('exportar')
      .setDescription('Exporta las estadísticas de voz a Excel (solo admins)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos registrados');
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
});

// Función centralizada para generar el Excel (se usa para auto-guardado y comando exportar)
async function generateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Estadísticas de Voz');

  sheet.columns = [
    { header: 'Usuario', key: 'usuario', width: 25 },
    { header: 'Canal', key: 'canal', width: 20 },
    { header: 'Conectó', key: 'conecto', width: 25 },
    { header: 'Desconectó', key: 'desconecto', width: 25 },
    { header: 'Tiempo conectado (h:m:s)', key: 'tiempo', width: 20 }
  ];

  userStats.forEach((stats, userId) => {
    // Intentar obtener el nombre del usuario desde el cache del servidor
    const guild = client.guilds.cache.first();
    const member = guild?.members.cache.get(userId);
    const username = member ? member.user.username : `ID: ${userId}`;

    stats.sessions.forEach(sess => {
      const total = sess.durationMs;
      const h = Math.floor(total / 3600000);
      const m = Math.floor((total % 3600000) / 60000);
      const s = Math.floor((total % 60000) / 1000);

      sheet.addRow({
        usuario: username,
        canal: sess.channel,
        conecto: formatDate(sess.joinedAt),
        desconecto: formatDate(sess.leftAt),
        tiempo: `${h}h ${m}m ${s}s`
      });
    });
  });
  return workbook;
}

// Evento de Voz
client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id;
  if (oldState.channelId === newState.channelId) return;

  // Entrada
  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, {
      channel: newState.channel.name,
      joinedAt: new Date()
    });
    return;
  }

  // Salida
  if (oldState.channelId && !newState.channelId) {
    const session = voiceSessions.get(userId);
    if (!session || processingIds.has(userId)) return;

    processingIds.add(userId);

    const leftAt = new Date();
    const durationMs = leftAt - session.joinedAt;

    if (durationMs > 1000) { // Ignorar menos de 1 segundo
      if (!userStats.has(userId)) {
        userStats.set(userId, { totalMs: 0, joins: 0, sessions: [] });
      }

      const stats = userStats.get(userId);
      stats.totalMs += durationMs;
      stats.joins += 1;
      stats.sessions.push({
        joinedAt: session.joinedAt,
        leftAt,
        durationMs,
        channel: session.channel
      });

      const h = Math.floor(durationMs / 3600000);
      const m = Math.floor((durationMs % 3600000) / 60000);
      const s = Math.floor((durationMs % 60000) / 1000);

      try {
        const textChannel = await client.channels.fetch(TEXT_CHANNEL_ID);
        if (textChannel) {
            await textChannel.send(`👤 **Usuario:** ${newState.member?.user.username}\n🎧 **Canal:** ${session.channel}\n📅 **Conectó:** ${formatDate(session.joinedAt)}\n📅 **Desconectó:** ${formatDate(leftAt)}\n⏱ **Tiempo:** ${h}h ${m}m ${s}s`);
        }
        
        // Auto-guardado en carpeta
        const workbook = await generateWorkbook();
        const dateStr = new Date().toISOString().split('T')[0];
        await workbook.xlsx.writeFile(path.join(EXCEL_FOLDER, `estadisticas_${dateStr}.xlsx`));

      } catch (err) {
        console.error('❌ Error:', err.message);
      }
    }

    voiceSessions.delete(userId);
    setTimeout(() => processingIds.delete(userId), 2000);
  }
});

// Comandos
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'horario') {
    const user = interaction.options.getUser('usuario');
    const stats = userStats.get(user.id);
    if (!stats) return interaction.reply({ content: `❌ Sin datos de ${user.username}`, ephemeral: true });

    const h = Math.floor(stats.totalMs / 3600000);
    const m = Math.floor((stats.totalMs % 3600000) / 60000);
    const s = Math.floor((stats.totalMs % 60000) / 1000);
    await interaction.reply(`📊 **${user.username}**\n🔁 Conexiones: ${stats.joins}\n⏱ Total: ${h}h ${m}m ${s}s`);
  }

  if (interaction.commandName === 'exportar') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Solo admins.', ephemeral: true });
    }

    if (userStats.size === 0) {
        return interaction.reply({ content: '❌ No hay datos acumulados para exportar.', ephemeral: true });
    }

    await interaction.deferReply(); // Darle tiempo al bot para generar el archivo

    try {
        const workbook = await generateWorkbook();
        const buffer = await workbook.xlsx.writeBuffer();
        
        await interaction.editReply({
          content: '📊 Aquí tienes el historial completo:',
          files: [{ attachment: buffer, name: `Reporte_Voz_${Date.now()}.xlsx` }]
        });
    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ Hubo un error al generar el Excel.');
    }
  }
});

client.login(process.env.TOKEN);