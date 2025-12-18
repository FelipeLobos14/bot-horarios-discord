const { SlashCommandBuilder } = require('discord.js');
const { formatDuration, isSameDay } = require('../utils/time');
const storage = require('../utils/storage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('horario')
    .setDescription('Muestra historial de voz')
    .addUserOption(opt =>
      opt.setName('usuario').setDescription('Usuario').setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');
    const history = storage.getUserHistory(user.id);

    if (history.length === 0) {
      return interaction.reply(`❌ ${user.username} no tiene registros`);
    }

    const today = new Date();
    const todaySessions = history.filter(s =>
      isSameDay(s.join, today)
    );

    let total = 0;
    todaySessions.forEach(s => total += s.duration);

    await interaction.reply(
      `📅 **Historial de hoy**
👤 ${user.username}
🔁 Conexiones: ${todaySessions.length}
⏱ Total: ${formatDuration(total)}`
    );
  }
};
