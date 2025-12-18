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

// 👉 CAMBIA ESTE ID POR TU CANAL DE TEXTO
const TEXT_CHANNEL_ID = '1451012983219032064';

// Carpeta donde se guardarán los Excel
const EXCEL_FOLDER = path.join(__dirname, 'estadisticas_excel');
if (!fs.existsSync(EXCEL_FOLDER)) fs.mkdirSync(EXCEL_FOLDER);

// Sesiones activas
const voiceSessions = new Map();

// Estadísticas acumuladas con historial de sesiones
// userStats = Map { userId => { totalMs, joins, sessions: [{ joinedAt, leftAt, channel }] } }
const userStats = new Map();

// Formatear fecha: "Lunes 17/05/2025 23:45:12"
function formatDate(date) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = days[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2,'0');
  const minutes = String(date.getMinutes()).padStart(2,'0');
  const seconds = String(date.getSeconds()).padStart(2,'0');

  return `${dayName} ${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

client.once('clientReady', async () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);

  // Registrar comandos slash
  const commands = [
    new SlashCommandBuilder()
      .setName('horario')
      .setDescription('Muestra el historial de voz de un usuario')
      .addUserOption(option =>
        option
          .setName('usuario')
          .setDescription('Usuario a consultar')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('exportar')
      .setDescription('Exporta las estadísticas de voz a Excel (solo admins)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Comandos registrados');
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
});

// -------------------- FUNCION GUARDAR EXCEL --------------------
async function saveExcel() {
  const dateStr = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const filePath = path.join(EXCEL_FOLDER, `estadisticas_voz_${dateStr}.xlsx`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Estadísticas de Voz');

  sheet.columns = [
    { header: 'Usuario', key: 'usuario', width: 25 },
    { header: 'Fecha', key: 'fecha', width: 25 },
    { header: 'Hora inicio', key: 'inicio', width: 15 },
    { header: 'Hora fin', key: 'fin', width: 15 },
    { header: 'Duración', key: 'duracion', width: 15 },
    { header: 'Canal', key: 'canal', width: 20 }
  ];

  userStats.forEach((stats, userId) => {
    const member = client.guilds.cache
      .first()
      ?.members.cache.get(userId);
    const username = member ? member.user.username : 'Desconocido';

    stats.sessions.forEach(sess => {
      const durationMs = sess.leftAt - sess.joinedAt;
      const seconds = Math.floor(durationMs / 1000) % 60;
      const minutes = Math.floor((durationMs / (1000*60)) % 60);
      const hours = Math.floor(durationMs / (1000*60*60));

      sheet.addRow({
        usuario: username,
        fecha: formatDate(sess.joinedAt).split(' ')[0] + ' ' + formatDate(sess.joinedAt).split(' ')[1],
        inicio: `${String(sess.joinedAt.getHours()).padStart(2,'0')}:${String(sess.joinedAt.getMinutes()).padStart(2,'0')}`,
        fin: `${String(sess.leftAt.getHours()).padStart(2,'0')}:${String(sess.leftAt.getMinutes()).padStart(2,'0')}`,
        duracion: `${hours}h ${minutes}m ${seconds}s`,
        canal: sess.channel
      });
    });
  });

  await workbook.xlsx.writeFile(filePath);
}

// -------------------- EVENTO VOICE --------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id;
  const username = newState.member?.user.username;

  // Entró a un canal
  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, {
      channel: newState.channel.name,
      joinedAt: new Date()
    });
    return;
  }

  // Salió de un canal
  if (oldState.channelId && !newState.channelId) {
    const session = voiceSessions.get(userId);
    if (!session) return;

    const leftAt = new Date();
    const durationMs = leftAt - session.joinedAt;

    const seconds = Math.floor(durationMs / 1000) % 60;
    const minutes = Math.floor(durationMs / (1000 * 60)) % 60;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));

    // Guardar estadísticas y historial
    if (!userStats.has(userId)) {
      userStats.set(userId, { totalMs: 0, joins: 0, sessions: [] });
    }

    const stats = userStats.get(userId);
    stats.totalMs += durationMs;
    stats.joins += 1;
    stats.sessions.push({
      channel: session.channel,
      joinedAt: session.joinedAt,
      leftAt: leftAt
    });

    const message = `
👤 **Usuario:** ${username}
🎧 **Canal:** ${session.channel}
📅 **Conectó:** ${formatDate(session.joinedAt)}
📅 **Desconectó:** ${formatDate(leftAt)}
⏱ **Tiempo conectado:** ${hours}h ${minutes}m ${seconds}s
    `;

    try {
      const textChannel = await client.channels.fetch(TEXT_CHANNEL_ID);
      await textChannel.send(message);
    } catch (err) {
      console.error('❌ Error enviando mensaje:', err.message);
    }

    voiceSessions.delete(userId);

    // Guardar Excel automáticamente
    try {
      await saveExcel();
    } catch (err) {
      console.error('❌ Error guardando Excel:', err.message);
    }
  }
});

// -------------------- COMANDOS --------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /horario
  if (interaction.commandName === 'horario') {
    const user = interaction.options.getUser('usuario');
    const stats = userStats.get(user.id);

    if (!stats) {
      return interaction.reply({
        content: `❌ ${user.username} no tiene registros aún.`,
        ephemeral: true
      });
    }

    const total = stats.totalMs;
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);

    const sessionList = stats.sessions
      .map((sess, i) =>
        `\n🔹 Sesión ${i + 1}: ${formatDate(sess.joinedAt)} → ${formatDate(sess.leftAt)} (${sess.channel})`
      )
      .join('');

    await interaction.reply(
      `📊 **Horario de ${user.username}**\n` +
      `🔁 Conexiones: ${stats.joins}\n` +
      `⏱ Tiempo total en voz: ${h}h ${m}m ${s}s` +
      `${sessionList}`
    );
  }

  // /exportar
  if (interaction.commandName === 'exportar') {
    // Solo admins
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '❌ Solo los administradores pueden usar este comando.',
        ephemeral: true
      });
    }

    if (userStats.size === 0) {
      return interaction.reply({
        content: '❌ No hay estadísticas para exportar.',
        ephemeral: true
      });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Estadísticas de Voz');

    sheet.columns = [
      { header: 'Usuario', key: 'usuario', width: 25 },
      { header: 'Fecha', key: 'fecha', width: 25 },
      { header: 'Hora inicio', key: 'inicio', width: 15 },
      { header: 'Hora fin', key: 'fin', width: 15 },
      { header: 'Duración', key: 'duracion', width: 15 },
      { header: 'Canal', key: 'canal', width: 20 }
    ];

    userStats.forEach((stats, userId) => {
      const member = interaction.guild.members.cache.get(userId);
      const username = member ? member.user.username : 'Desconocido';

      stats.sessions.forEach(sess => {
        const durationMs = sess.leftAt - sess.joinedAt;
        const seconds = Math.floor(durationMs / 1000) % 60;
        const minutes = Math.floor((durationMs / (1000*60)) % 60);
        const hours = Math.floor(durationMs / (1000*60*60));

        sheet.addRow({
          usuario: username,
          fecha: formatDate(sess.joinedAt).split(' ')[0] + ' ' + formatDate(sess.joinedAt).split(' ')[1],
          inicio: `${String(sess.joinedAt.getHours()).padStart(2,'0')}:${String(sess.joinedAt.getMinutes()).padStart(2,'0')}`,
          fin: `${String(sess.leftAt.getHours()).padStart(2,'0')}:${String(sess.leftAt.getMinutes()).padStart(2,'0')}`,
          duracion: `${hours}h ${minutes}m ${seconds}s`,
          canal: sess.channel
        });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    await interaction.reply({
      content: '📊 Estadísticas exportadas:',
      files: [{ attachment: buffer, name: `horario_${Date.now()}.xlsx` }]
    });
  }
});

client.login(process.env.TOKEN);
