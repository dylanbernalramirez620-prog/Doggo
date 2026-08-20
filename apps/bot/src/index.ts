import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder,
  GatewayIntentBits, Partials, PermissionFlagsBits, type ChatInputCommandInteraction,
  type Guild, type GuildMember, type Interaction, type TextChannel
} from 'discord.js';
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '@doggo/config';
import { commandData } from './commands.js';

type GuildConfig = { automodChannelId?: string; sanctionChannelId?: string; verificationRoleId?: string; welcomeChannelId?: string; welcomeMessage?: string; goodbyeChannelId?: string; goodbyeMessage?: string; autoroleId?: string; ticketSupportRoleId?: string; ticketCategoryId?: string };
type Sanction = { id: string; type: string; targetId: string; reason: string; status: 'Active' | 'Expired' | 'Removed'; expiresAt?: number };
const configs = new Map<string, GuildConfig>();
const sanctions = new Map<string, Sanction[]>();
const suggestionVotes = new Map<string, Set<string>>();
const messageHistory = new Map<string, { content: string; at: number }[]>();
const giveawayEntries = new Map<string, Set<string>>();
const pollVotes = new Map<string, Map<string, string>>();
const openingTickets = new Set<string>();
let sanctionSequence = 1;
let giveawaySequence = 1;
const DOGGO_FOOTER = '🐶 Doggo Pixel Assistant';
const lockFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../doggo-bot.lock');

function acquireBotLock() {
  if (existsSync(lockFile)) {
    const previousPid = Number(readFileSync(lockFile, 'utf8'));
    try {
      process.kill(previousPid, 0);
      throw new Error(`Doggo ya esta ejecutandose (PID ${previousPid}). Cierra esa instancia antes de iniciar otra.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('ya esta ejecutandose')) throw error;
      unlinkSync(lockFile);
    }
  }
  const descriptor = openSync(lockFile, 'wx');
  writeFileSync(descriptor, String(process.pid));
  const release = () => { if (existsSync(lockFile) && readFileSync(lockFile, 'utf8') === String(process.pid)) unlinkSync(lockFile); };
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(0); });
  process.once('SIGTERM', () => { release(); process.exit(0); });
}

acquireBotLock();

function doggoEmbed(title: string, description: string, color: number, badge: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${badge}  Doggo` })
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: DOGGO_FOOTER })
    .setTimestamp();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

function getGuild(interaction: ChatInputCommandInteraction): Guild {
  if (!interaction.guild) throw new Error('Este comando solo funciona dentro de un servidor.');
  return interaction.guild;
}
function getConfig(guildId: string): GuildConfig { const config = configs.get(guildId) ?? {}; configs.set(guildId, config); return config; }
function getTextChannel(interaction: ChatInputCommandInteraction, name: string): TextChannel {
  const channel = interaction.options.getChannel(name, true);
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Selecciona un canal de texto.');
  return channel as TextChannel;
}
function durationMs(value: string): number {
  const match = /^(\d+)(m|h|d|w)$/.exec(value.toLowerCase());
  if (!match) throw new Error('Duracion invalida. Usa 30m, 1h, 3d o 1w.');
  const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const result = Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
  if (result > 28 * 86_400_000) throw new Error('La duracion maxima de Timeout es 28 dias.');
  return result;
}
function createSanction(targetId: string, type: string, reason: string, expiresAt?: number): Sanction {
  const sanction: Sanction = { id: `SANC-${String(sanctionSequence++).padStart(4, '0')}`, type, targetId, reason, status: 'Active', expiresAt };
  sanctions.set(targetId, [...(sanctions.get(targetId) ?? []), sanction]); return sanction;
}
async function publishSanction(guild: Guild, interaction: ChatInputCommandInteraction, sanction: Sanction, evidence?: string) {
  const channel = getConfig(guild.id).sanctionChannelId ? guild.channels.cache.get(getConfig(guild.id).sanctionChannelId!) : undefined;
  if (!channel?.isTextBased()) return;
  const sanctionEmoji = sanction.type === 'Warn' ? '⚠️' : sanction.type === 'Mute' ? '🔇' : sanction.type === 'Ban' ? '🔨' : '👢';
  const embed = doggoEmbed(`${sanctionEmoji} ${sanction.type} aplicada`, 'Registro oficial de moderación de Doggo.', sanction.type === 'Warn' ? 0xf0b429 : 0xd64545, '🛡️ SANCIÓN');
  embed.addFields(
    { name: 'Sanction ID', value: `#${sanction.id}`, inline: true },
    { name: 'Jugador sancionado', value: `<@${sanction.targetId}> (${sanction.targetId})`, inline: true },
    { name: 'Moderador', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: true },
    { name: 'Razon', value: sanction.reason.slice(0, 1024) },
    { name: 'Evidencia', value: evidence || 'No adjuntada', inline: true },
    { name: 'Estado', value: sanction.status, inline: true }
  );
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}
function ticketButtons() { return new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('ticket:open').setLabel('🎫 Abrir ticket').setStyle(ButtonStyle.Primary)
); }
function ticketMessageButtons() { return new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('ticket:claim').setLabel('🙋 Reclamar ticket').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('ticket:close').setLabel('🔒 Cerrar ticket').setStyle(ButtonStyle.Danger)
); }
function ticketPanelEmbed() { return doggoEmbed('🎫 Centro de soporte', 'Pulsa **🎫 Abrir ticket** para contactar con el equipo de soporte.', 0x8b5e3c, '🎫 SOPORTE'); }
async function publishTicketPanel(channel: TextChannel) {
  const recentMessages = await channel.messages.fetch({ limit: 100 });
  const existingPanels = Array.from(recentMessages.filter((message) => message.author.id === client.user?.id && message.components.some((row) => 'components' in row && row.components.some((component) => 'customId' in component && (component.customId === 'ticket:open' || component.customId === 'ticket:support')))).values());
  const existingPanel = existingPanels[0];
  if (existingPanel) {
    await existingPanel.edit({ embeds: [ticketPanelEmbed()], components: [ticketButtons()] });
    await Promise.all(existingPanels.slice(1).map((message) => message.delete().catch(() => undefined)));
    return 'updated';
  }
  await channel.send({ embeds: [ticketPanelEmbed()], components: [ticketButtons()] });
  return 'created';
}
async function cleanupTicketPanels(channel: TextChannel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const panels = Array.from(messages.filter((message) => message.author.id === client.user?.id && message.components.some((row) => 'components' in row && row.components.some((component) => 'customId' in component && (component.customId === 'ticket:open' || component.customId === 'ticket:support')))).values());
  await Promise.all(panels.slice(1).map((message) => message.delete().catch(() => undefined)));
  return panels.length > 1 ? panels.length - 1 : 0;
}
function replaceMemberText(message: string, user: { toString(): string }, guild: Guild) { return message.replaceAll('{user}', user.toString()).replaceAll('{server}', guild.name); }
async function sendUniqueMemberEmbed(channel: TextChannel, embed: EmbedBuilder, memberMention: string) {
  const recentMessages = await channel.messages.fetch({ limit: 25 });
  const matchingMessages = Array.from(recentMessages.filter((message) => message.author.id === client.user?.id && message.embeds.some((existing) => existing.footer?.text === DOGGO_FOOTER && existing.description?.includes(memberMention))).values());
  await Promise.all(matchingMessages.slice(1).map((message) => message.delete().catch(() => undefined)));
  if (matchingMessages.length > 0) return false;
  await channel.send({ embeds: [embed] });
  return true;
}
function parseDelay(value: string) {
  const match = /^(\d+)(m|h|d)$/.exec(value.toLowerCase());
  if (!match) throw new Error('Tiempo invalido. Usa 10m, 2h o 1d.');
  return Number(match[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'm' | 'h' | 'd']);
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const guild = getGuild(interaction); const subcommand = interaction.options.getSubcommand(false); const config = getConfig(guild.id);
  if (interaction.commandName === 'ping') return interaction.reply({ embeds: [doggoEmbed('🏓 Pong!', 'Doggo está online y listo para trabajar.', 0x8b5e3c, '💡 SISTEMA')], ephemeral: true });
  if (interaction.commandName === 'help') return interaction.reply({ embeds: [doggoEmbed('📚 Comandos de Doggo', '**🛡️ Moderación**\n`/automod` `/warn` `/mute` `/ban` `/unban` `/kick` `/clear`\n\n**🎫 Soporte y comunidad**\n`/ticket` `/verification` `/suggest` `/report`\n\n**📊 Servidor**\n`/counters` `/profile` `/sanctions`', 0x8b5e3c, '🐶 CENTRO DE COMANDOS')], ephemeral: true });

  if (interaction.commandName === 'automod') {
    if (subcommand === 'setup') { const channel = getTextChannel(interaction, 'channel'); config.automodChannelId = channel.id; return interaction.reply({ embeds: [doggoEmbed('🛡️ AutoMod activado', `Los avisos aparecerán en ${channel}.\n\n**Protecciones:** spam · invitaciones · menciones masivas`, 0x2ecc71, '🛡️ SEGURIDAD')], ephemeral: true }); }
    if (subcommand === 'off') { delete config.automodChannelId; return interaction.reply({ embeds: [doggoEmbed('🔕 AutoMod desactivado', 'La protección automática ha sido pausada.', 0xe67e22, '⚙️ CONFIGURACIÓN')], ephemeral: true }); }
    return interaction.reply({ embeds: [doggoEmbed('🔎 Estado de AutoMod', config.automodChannelId ? `🟢 Activo en <#${config.automodChannelId}>` : '🔴 Desactivado', 0x3498db, '🛡️ SEGURIDAD')], ephemeral: true });
  }
  if (interaction.commandName === 'ticket' && (subcommand === 'setup' || subcommand === 'panel')) {
    const channel = getTextChannel(interaction, 'channel');
    if (subcommand === 'setup') {
      const supportRole = interaction.options.getRole('support_role', true);
      const category = interaction.options.getChannel('category', true);
      if (category.type !== ChannelType.GuildCategory) throw new Error('Selecciona una categoria del servidor.');
      config.ticketSupportRoleId = supportRole.id;
      config.ticketCategoryId = category.id;
    }
    const result = await publishTicketPanel(channel);
    return interaction.reply({ embeds: [doggoEmbed(result === 'created' ? '✅ Panel publicado' : '♻️ Panel actualizado', result === 'created' ? `Panel listo en ${channel}.` : `El panel existente en ${channel} fue actualizado y se eliminaron duplicados.`, 0x2ecc71, '🎫 SOPORTE')], ephemeral: true });
  }
  if (interaction.commandName === 'ticket' && subcommand === 'cleanup') {
    const channel = getTextChannel(interaction, 'channel'); const removed = await cleanupTicketPanels(channel);
    return interaction.reply({ embeds: [doggoEmbed('🧹 Paneles limpiados', removed ? `Se eliminaron **${removed}** paneles duplicados.` : 'No había paneles duplicados.', 0x2ecc71, '🎫 SOPORTE')], ephemeral: true });
  }
  if (interaction.commandName === 'ticket') {
    const channelName = interaction.channel && 'name' in interaction.channel && typeof interaction.channel.name === 'string' ? interaction.channel.name : '';
    if (!interaction.channel || !channelName.startsWith('ticket-')) throw new Error('🎫 Usa `/ticket close` dentro de un canal ticket-.');
    const messages = 'messages' in interaction.channel ? await interaction.channel.messages.fetch({ limit: 100 }) : undefined;
    const transcript = messages ? [...messages.values()].reverse().map((message) => `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.content}`).join('\n') : 'Transcript vacio';
    const logChannel = config.sanctionChannelId ? guild.channels.cache.get(config.sanctionChannelId) : undefined;
    if (logChannel && 'send' in logChannel) await logChannel.send({ content: `📄 Transcript de ${channelName}`, files: [{ attachment: Buffer.from(transcript, 'utf8'), name: `${channelName}.txt` }] });
    await interaction.reply({ embeds: [doggoEmbed('🔒 Ticket cerrado', 'El transcript fue enviado a los logs.', 0x95a5a6, '🎫 SOPORTE')], ephemeral: true });
    await interaction.channel.delete('Ticket cerrado');
    return;
  }
  if (interaction.commandName === 'verification') {
    const channel = getTextChannel(interaction, 'channel'); const role = interaction.options.getRole('role', true); config.verificationRoleId = role.id;
    await channel.send({ embeds: [doggoEmbed('✅ Verificación segura', 'Pulsa el botón para recibir el rol verificado y desbloquear el servidor.', 0x4caf50, '🔐 SEGURIDAD')], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('verification:complete').setLabel('✅ Verificarme').setStyle(ButtonStyle.Success))] }); return interaction.reply({ embeds: [doggoEmbed('✅ Verificación configurada', `Panel publicado en ${channel}.`, 0x2ecc71, '⚙️ CONFIGURACIÓN')], ephemeral: true });
  }
  if (interaction.commandName === 'suggest') {
    const title = interaction.options.getString('title', true); const description = interaction.options.getString('description', true); const id = interaction.id; suggestionVotes.set(id, new Set());
    return interaction.reply({ embeds: [doggoEmbed(`💡 ${title}`, description, 0x3498db, '💡 SUGERENCIA').setFooter({ text: `🐶 Doggo · Suggestion ${id}` })], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`suggestion:up:${id}`).setLabel('👍 A favor: 0').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`suggestion:down:${id}`).setLabel('👎 En contra: 0').setStyle(ButtonStyle.Secondary))] });
  }
  if (interaction.commandName === 'report') {
    const target = interaction.options.getUser('user', true); const description = interaction.options.getString('description', true); const evidence = interaction.options.getString('evidence') || 'No adjuntada'; const channel = config.sanctionChannelId ? guild.channels.cache.get(config.sanctionChannelId) : interaction.channel;
    if (!channel || !('send' in channel)) throw new Error('Configura primero un canal con `/sanctions setup`.'); await channel.send({ embeds: [doggoEmbed('🚨 Nuevo reporte', 'Un reporte requiere revisión del equipo de moderación.', 0xe67e22, '🚨 MODERACIÓN').addFields({ name: '👤 Usuario reportado', value: `${target.tag} (${target.id})` }, { name: '📝 Descripción', value: description }, { name: '🔗 Evidencia', value: evidence })], allowedMentions: { parse: [] } }); return interaction.reply({ embeds: [doggoEmbed('✅ Reporte enviado', 'El staff recibió tu reporte de forma privada.', 0x2ecc71, '🚨 MODERACIÓN')], ephemeral: true });
  }
  if (interaction.commandName === 'counters') {
    const category = interaction.options.getChannel('category', true); if (category.type !== ChannelType.GuildCategory) throw new Error('Selecciona una categoria.');
    for (const name of [`👥 Miembros: ${guild.memberCount}`, '🟢 Online: calculando', '🎙️ En voz: 0']) await guild.channels.create({ name: `🐶 ${name}`, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] }); return interaction.reply({ embeds: [doggoEmbed('📊 Contadores creados', 'Los canales estadísticos están bloqueados y visibles en la categoría seleccionada.', 0x3498db, '📊 ESTADÍSTICAS')], ephemeral: true });
  }
  if (interaction.commandName === 'profile') {
    const target = interaction.options.getUser('user') ?? interaction.user; const history = sanctions.get(target.id) ?? []; const active = history.filter((item) => item.status === 'Active'); const embed = doggoEmbed(`👤 Perfil de ${target.username}`, 'Resumen de actividad y reputación en Doggo.', 0x8b5e3c, '🏅 PERFIL').setThumbnail(target.displayAvatarURL()); embed.addFields({ name: '⚠️ Emblemas de advertencia activos', value: active.length ? active.map((item) => `🔸 #${item.id} · ${item.type}`).join('\n') : '✅ Ninguno' }, { name: '📚 Historial total', value: `🏷️ ${history.length} registro(s)` }); return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if (interaction.commandName === 'sanctions') { const channel = getTextChannel(interaction, 'channel'); config.sanctionChannelId = channel.id; return interaction.reply({ embeds: [doggoEmbed('✅ Canal de sanciones configurado', `Los registros aparecerán en ${channel}.`, 0x2ecc71, '⚙️ CONFIGURACIÓN')], ephemeral: true }); }
  if (interaction.commandName === 'warn') { const target = interaction.options.getUser('user', true); const sanction = createSanction(target.id, 'Warn', interaction.options.getString('reason', true)); await publishSanction(guild, interaction, sanction, interaction.options.getString('evidence') || undefined); return interaction.reply({ embeds: [doggoEmbed('⚠️ Advertencia aplicada', `Se creó el emblema **#${sanction.id}** para ${target}.`, 0xf0b429, '🛡️ SANCIÓN')], ephemeral: true }); }
  if (interaction.commandName === 'mute') {
    const target = interaction.options.getUser('user', true); const member = await guild.members.fetch(target.id); const reason = interaction.options.getString('reason', true); const evidence = interaction.options.getString('evidence') || undefined;
    if (subcommand === 'temp') { const duration = durationMs(interaction.options.getString('duration', true)); await member.timeout(duration, reason); const sanction = createSanction(target.id, 'Mute', reason, Date.now() + duration); await publishSanction(guild, interaction, sanction, evidence); return interaction.reply({ embeds: [doggoEmbed('🔇 Silencio temporal aplicado', `Mute creado: **#${sanction.id}** · Duración: [1m${interaction.options.getString('duration', true)}[0m.`, 0xe67e22, '🛡️ SANCIÓN')], ephemeral: true }); }
    let role = guild.roles.cache.find((item) => item.name === 'Muteadito'); if (!role) role = await guild.roles.create({ name: 'Muteadito', reason: 'Rol de mute permanente Doggo' }); await member.roles.add(role, reason); const sanction = createSanction(target.id, 'Mute', reason); await publishSanction(guild, interaction, sanction, evidence); return interaction.reply({ embeds: [doggoEmbed('🔇 Silencio permanente aplicado', `Rol **${role.name}** asignado. ID: **#${sanction.id}**.`, 0xe67e22, '🛡️ SANCIÓN')], ephemeral: true });
  }
  if (interaction.commandName === 'ban') {
    const target = interaction.options.getUser('user', true); const reason = interaction.options.getString('reason', true); const evidence = interaction.options.getString('evidence') || undefined; const expiresAt = subcommand === 'temp' ? Date.now() + durationMs(interaction.options.getString('duration', true)) : undefined;
    await guild.members.ban(target, { reason, deleteMessageSeconds: 0 }); const sanction = createSanction(target.id, 'Ban', reason, expiresAt); await publishSanction(guild, interaction, sanction, evidence); if (expiresAt) setTimeout(async () => { await guild.bans.remove(target.id, 'Ban temporal expirado').catch(() => undefined); sanction.status = 'Expired'; }, expiresAt - Date.now()); return interaction.reply({ content: `Ban aplicado: #${sanction.id}.`, ephemeral: true });
  }
  if (interaction.commandName === 'unban') { const userId = interaction.options.getString('user_id', true); await guild.bans.remove(userId, 'Unban de staff'); (sanctions.get(userId) ?? []).filter((item) => item.type === 'Ban' && item.status === 'Active').forEach((item) => { item.status = 'Removed'; }); return interaction.reply({ content: `Ban retirado para ${userId}.`, ephemeral: true }); }
  if (interaction.commandName === 'unmute') { const target = interaction.options.getUser('user', true); const member = await guild.members.fetch(target.id); await member.timeout(null, 'Unmute de staff'); const role = guild.roles.cache.find((item) => item.name === 'Muteadito'); if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, 'Unmute de staff'); (sanctions.get(target.id) ?? []).filter((item) => item.type === 'Mute' && item.status === 'Active').forEach((item) => { item.status = 'Removed'; }); return interaction.reply({ content: `Mute retirado para ${target.tag}.`, ephemeral: true }); }
  if (interaction.commandName === 'kick') { const target = interaction.options.getUser('user', true); const member = await guild.members.fetch(target.id); await member.kick(interaction.options.getString('reason', true)); return interaction.reply({ content: `Usuario expulsado: ${target.tag}.`, ephemeral: true }); }
  if (interaction.commandName === 'clear') { const amount = interaction.options.getInteger('amount', true); if (!interaction.channel || !('bulkDelete' in interaction.channel)) throw new Error('Este canal no permite borrar mensajes.'); await interaction.channel.bulkDelete(amount, true); return interaction.reply({ content: `Se borraron ${amount} mensajes.`, ephemeral: true }); }
  if (interaction.commandName === 'welcome' || interaction.commandName === 'goodbye') {
    const prefix = interaction.commandName === 'welcome' ? 'welcome' : 'goodbye';
    if (subcommand === 'test') {
      const channelId = prefix === 'welcome' ? config.welcomeChannelId : config.goodbyeChannelId;
      const template = prefix === 'welcome' ? config.welcomeMessage : config.goodbyeMessage;
      if (!channelId || !template) throw new Error(`Configura primero /${prefix} setup.`);
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !('send' in channel)) throw new Error('El canal configurado ya no existe o no es de texto.');
      const testEmbed = doggoEmbed(prefix === 'welcome' ? '👋 Prueba de bienvenida' : '🚪 Prueba de despedida', replaceMemberText(template, interaction.user, guild), prefix === 'welcome' ? 0x2ecc71 : 0x95a5a6, prefix === 'welcome' ? '👋 BIENVENIDA' : '🚪 DESPEDIDA').setThumbnail(interaction.user.displayAvatarURL());
      const sent = await sendUniqueMemberEmbed(channel as TextChannel, testEmbed, interaction.user.toString());
      return interaction.reply({ embeds: [doggoEmbed(sent ? '✅ Prueba enviada' : '♻️ Prueba ya existente', sent ? `Revisa ${channel}.` : `Ya existía una prueba reciente en ${channel}; no se duplicó.`, 0x2ecc71, '🧪 TEST')], ephemeral: true });
    }
    const channel = getTextChannel(interaction, 'channel'); const message = interaction.options.getString('message', true);
    if (prefix === 'welcome') { config.welcomeChannelId = channel.id; config.welcomeMessage = message; } else { config.goodbyeChannelId = channel.id; config.goodbyeMessage = message; }
    return interaction.reply({ embeds: [doggoEmbed(`${prefix === 'welcome' ? '👋 Bienvenidas' : '🚪 Despedidas'} configuradas`, `Los mensajes se publicarán en ${channel}.\nPlantilla: ${message}`, 0x2ecc71, '⚙️ CONFIGURACIÓN')], ephemeral: true });
  }
  if (interaction.commandName === 'autorole') {
    if (subcommand === 'off') { delete config.autoroleId; return interaction.reply({ embeds: [doggoEmbed('🔕 Autorole desactivado', 'Ya no se asignarán roles automáticamente.', 0xe67e22, '⚙️ CONFIGURACIÓN')], ephemeral: true }); }
    const role = interaction.options.getRole('role', true); config.autoroleId = role.id; return interaction.reply({ embeds: [doggoEmbed('🏷️ Autorole configurado', `Cada nuevo miembro recibirá ${role}.`, 0x2ecc71, '⚙️ CONFIGURACIÓN')], ephemeral: true });
  }
  if (interaction.commandName === 'giveaway') {
    if (subcommand === 'end') { const id = interaction.options.getString('id', true); const entries = giveawayEntries.get(id); return interaction.reply({ embeds: [doggoEmbed('🏆 Sorteo finalizado', `Sorteo **#${id}** cerrado con **${entries?.size ?? 0}** participantes.`, 0xf1c40f, '🏆 GIVEAWAY')], ephemeral: true }); }
    const prize = interaction.options.getString('prize', true); const duration = parseDelay(interaction.options.getString('duration', true)); const winners = interaction.options.getInteger('winners', true); const id = String(giveawaySequence++).padStart(4, '0'); giveawayEntries.set(id, new Set());
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`giveaway:join:${id}`).setLabel('🎟️ Participar (0)').setStyle(ButtonStyle.Success));
    await interaction.reply({ embeds: [doggoEmbed(`🏆 Giveaway #${id}`, `**Premio:** ${prize}\n**Ganadores:** ${winners}\nPulsa el botón para participar.`, 0xf1c40f, '🏆 GIVEAWAY')], components: [row] });
    setTimeout(() => giveawayEntries.delete(id), duration); return;
  }
  if (interaction.commandName === 'poll') {
    const question = interaction.options.getString('question', true); const duration = parseDelay(interaction.options.getString('duration', true)); const id = interaction.id; pollVotes.set(id, new Map());
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`poll:yes:${id}`).setLabel('👍 Sí (0)').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`poll:no:${id}`).setLabel('👎 No (0)').setStyle(ButtonStyle.Danger));
    await interaction.reply({ embeds: [doggoEmbed(`📊 ${question}`, 'Vota usando los botones de abajo.', 0x3498db, '📊 ENCUESTA')], components: [row] }); setTimeout(() => pollVotes.delete(id), duration); return;
  }
  if (interaction.commandName === 'announce') {
    const channel = getTextChannel(interaction, 'channel'); const title = interaction.options.getString('title', true); const message = interaction.options.getString('message', true); await channel.send({ embeds: [doggoEmbed(`📢 ${title}`, message, 0x3498db, '📢 ANUNCIO')] }); return interaction.reply({ embeds: [doggoEmbed('✅ Anuncio publicado', `Publicado en ${channel}.`, 0x2ecc71, '📢 ANUNCIOS')], ephemeral: true });
  }
  if (interaction.commandName === 'remind') {
    const delay = parseDelay(interaction.options.getString('time', true)); const message = interaction.options.getString('message', true); await interaction.reply({ embeds: [doggoEmbed('⏰ Recordatorio creado', `Te avisaré en **${interaction.options.getString('time', true)}**.`, 0x9b59b6, '⏰ UTILIDAD')], ephemeral: true }); setTimeout(() => interaction.user.send({ embeds: [doggoEmbed('🔔 Tu recordatorio', message, 0x9b59b6, '⏰ DOGGO')]}).catch(() => undefined), delay); return;
  }
  if (interaction.commandName === 'event') {
    const name = interaction.options.getString('name', true); const start = interaction.options.getString('start', true); const description = interaction.options.getString('description', true); const date = new Date(start); if (Number.isNaN(date.getTime())) throw new Error('La fecha debe estar en formato ISO, por ejemplo 2026-08-20T20:00:00Z.');
    return interaction.reply({ embeds: [doggoEmbed(`📅 ${name}`, `${description}\n\n🕒 Inicio: <t:${Math.floor(date.getTime() / 1000)}:F>`, 0x1abc9c, '📅 EVENTO') ] });
  }
}

client.once('ready', (readyClient) => console.log(`Doggo online as ${readyClient.user.tag} en ${readyClient.guilds.cache.size} servidor(es)`));
client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction);
    if (interaction.isButton() && interaction.customId === 'verification:complete') { if (!interaction.guild) throw new Error('Solo funciona en servidor.'); const roleId = getConfig(interaction.guild.id).verificationRoleId; if (!roleId) throw new Error('La verificacion no esta configurada.'); await (interaction.member as GuildMember).roles.add(roleId); return interaction.reply({ content: 'Verificacion completada.', ephemeral: true }); }
    if (interaction.isButton() && interaction.customId === 'ticket:open') {
      if (!interaction.guild) throw new Error('Solo funciona en servidor.');
      const config = getConfig(interaction.guild.id);
      if (!config.ticketCategoryId || !config.ticketSupportRoleId) throw new Error('El sistema no esta configurado. Usa `/ticket setup`.');
      const lockKey = `${interaction.guild.id}:${interaction.user.id}`;
      if (openingTickets.has(lockKey)) return interaction.reply({ content: '⏳ Doggo ya está creando tu ticket.', ephemeral: true });
      openingTickets.add(lockKey);
      try {
        await interaction.guild.channels.fetch();
        const matchingTickets = Array.from(interaction.guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText && channel.topic?.startsWith(`Doggo ticket owner: ${interaction.user.id}`)).values());
        const existingTicket = matchingTickets[0];
        await Promise.all(matchingTickets.slice(1).map((channel) => channel.delete('Eliminar ticket duplicado de Doggo').catch(() => undefined)));
        if (existingTicket) return interaction.reply({ embeds: [doggoEmbed('🎫 Ya tienes un ticket abierto', `Puedes continuar aquí: ${existingTicket}.`, 0xf0b429, '🎫 SOPORTE')], ephemeral: true });
        const ticket = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.slice(0, 90), type: ChannelType.GuildText, parent: config.ticketCategoryId,
          topic: `Doggo ticket owner: ${interaction.user.id}`,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: config.ticketSupportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });
        await ticket.send({ content: `${interaction.user} | <@&${config.ticketSupportRoleId}>`, embeds: [doggoEmbed('📢 Staff mencionado', 'El staff fue mencionado y pronto un staff llegará a atenderte.\n\nGracias por leer esto. 🐶', 0x3498db, '🎫 TICKET ABIERTO').addFields({ name: '👤 Usuario', value: `${interaction.user}` }, { name: '🧰 Soporte', value: `<@&${config.ticketSupportRoleId}>` })], components: [ticketMessageButtons()], allowedMentions: { users: [interaction.user.id], roles: [config.ticketSupportRoleId] } });
        return interaction.reply({ embeds: [doggoEmbed('✅ Ticket creado', `Tu ticket está listo: ${ticket}.`, 0x2ecc71, '🎫 SOPORTE')], ephemeral: true });
      } finally {
        openingTickets.delete(lockKey);
      }
    }
    if (interaction.isButton() && interaction.customId === 'ticket:claim') {
      if (!interaction.guild || !interaction.channel || !('name' in interaction.channel) || !String(interaction.channel.name).startsWith('ticket-')) throw new Error('Este boton solo funciona dentro de un ticket.');
      const ticketChannel = interaction.channel as TextChannel;
      if (ticketChannel.topic?.includes('Doggo claimed by:')) return interaction.reply({ content: '🙋 Este ticket ya fue reclamado por otro miembro del staff.', ephemeral: true });
      const config = getConfig(interaction.guild.id); const member = interaction.member as GuildMember;
      if (!member.roles.cache.has(config.ticketSupportRoleId ?? '') && !member.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Solo el staff puede reclamar tickets.');
      await ticketChannel.setTopic(`${ticketChannel.topic ?? 'Doggo ticket'} | Doggo claimed by: ${interaction.user.id}`);
      const claimMessages = Array.from((await ticketChannel.messages.fetch({ limit: 100 })).filter((message) => message.author.id === client.user?.id && message.embeds.some((embed) => embed.title === '🙋 Ticket reclamado')).values());
      await Promise.all(claimMessages.slice(1).map((message) => message.delete().catch(() => undefined)));
      if (claimMessages.length === 0) await ticketChannel.send({ embeds: [doggoEmbed('🙋 Ticket reclamado', `${interaction.user} atenderá este ticket.`, 0x2ecc71, '🧰 STAFF')] });
      return interaction.reply({ content: '✅ Has reclamado este ticket.', ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId === 'ticket:close') {
      if (!interaction.guild || !interaction.channel || !('name' in interaction.channel) || !String(interaction.channel.name).startsWith('ticket-')) throw new Error('Este boton solo funciona dentro de un ticket.');
      const messages = 'messages' in interaction.channel ? await interaction.channel.messages.fetch({ limit: 100 }) : undefined;
      const transcript = messages ? [...messages.values()].reverse().map((message) => `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.content}`).join('\n') : 'Transcript vacio';
      const logChannel = getConfig(interaction.guild.id).sanctionChannelId ? interaction.guild.channels.cache.get(getConfig(interaction.guild.id).sanctionChannelId!) : undefined;
      if (logChannel && 'send' in logChannel) await logChannel.send({ content: `📄 Transcript de ${interaction.channel.name}`, files: [{ attachment: Buffer.from(transcript, 'utf8'), name: `${interaction.channel.name}.txt` }] });
      await interaction.reply({ embeds: [doggoEmbed('🔒 Ticket cerrado', 'El transcript fue enviado a los logs.', 0x95a5a6, '🎫 SOPORTE')], ephemeral: true });
      await interaction.channel.delete('Ticket cerrado');
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('suggestion:')) { const [, direction, id] = interaction.customId.split(':'); const votes = suggestionVotes.get(id) ?? new Set(); const key = `${direction}:${interaction.user.id}`; if ([...votes].some((vote) => vote.endsWith(`:${interaction.user.id}`))) return interaction.reply({ content: 'Ya votaste esta sugerencia.', ephemeral: true }); votes.add(key); suggestionVotes.set(id, votes); return interaction.reply({ content: `Voto ${direction === 'up' ? 'a favor' : 'en contra'} registrado.`, ephemeral: true }); }
    if (interaction.isButton() && interaction.customId.startsWith('giveaway:join:')) { const id = interaction.customId.split(':')[2]; const entries = giveawayEntries.get(id); if (!entries) throw new Error('Este sorteo ya terminó.'); if (entries.has(interaction.user.id)) return interaction.reply({ content: '🎟️ Ya estás participando.', ephemeral: true }); entries.add(interaction.user.id); return interaction.reply({ embeds: [doggoEmbed('🎟️ Participación confirmada', `Ya estás dentro del giveaway **#${id}**.`, 0x2ecc71, '🏆 GIVEAWAY')], ephemeral: true }); }
    if (interaction.isButton() && interaction.customId.startsWith('poll:')) { const [, choice, id] = interaction.customId.split(':'); const votes = pollVotes.get(id); if (!votes) throw new Error('Esta encuesta ya terminó.'); if (votes.has(interaction.user.id)) return interaction.reply({ content: '📊 Ya votaste esta encuesta.', ephemeral: true }); votes.set(interaction.user.id, choice); return interaction.reply({ content: `✅ Voto registrado: ${choice === 'yes' ? 'Sí' : 'No'}.`, ephemeral: true }); }
  } catch (error) { console.error('Interaction failed', error); if (interaction.isRepliable()) { const response = { content: error instanceof Error ? error.message : 'Doggo no pudo completar la accion.', ephemeral: true }; if (interaction.replied || interaction.deferred) await interaction.followUp(response); else await interaction.reply(response); } }
});
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return; const channelId = getConfig(message.guild.id).automodChannelId; if (!channelId) return; const now = Date.now(); const recent = (messageHistory.get(message.author.id) ?? []).filter((item) => now - item.at < 10_000); recent.push({ content: message.content, at: now }); messageHistory.set(message.author.id, recent);
  if (!/(discord\.gg\/|@everyone|@here)/i.test(message.content) && recent.length < 6 && recent.filter((item) => item.content === message.content).length < 3) return; await message.delete().catch(() => undefined); if (message.member?.moderatable) await message.member.timeout(60_000, 'AutoMod: spam o contenido bloqueado').catch(() => undefined); const log = message.guild.channels.cache.get(channelId); if (log?.isTextBased()) await log.send(`AutoMod bloqueo un mensaje de ${message.author.tag} en <#${message.channel.id}>.`);
});
client.on('guildMemberAdd', async (member) => {
  const config = getConfig(member.guild.id);
  if (config.autoroleId) await member.roles.add(config.autoroleId, 'Autorole Doggo').catch(() => undefined);
  if (!config.welcomeChannelId || !config.welcomeMessage) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId); if (channel && 'send' in channel) await sendUniqueMemberEmbed(channel as TextChannel, doggoEmbed('👋 ¡Nuevo miembro!', replaceMemberText(config.welcomeMessage, member, member.guild), 0x2ecc71, '👋 BIENVENIDA').setThumbnail(member.user.displayAvatarURL()), member.toString());
});
client.on('guildMemberRemove', async (member) => {
  const config = getConfig(member.guild.id); if (!config.goodbyeChannelId || !config.goodbyeMessage) return;
  const channel = member.guild.channels.cache.get(config.goodbyeChannelId); if (channel && 'send' in channel) await sendUniqueMemberEmbed(channel as TextChannel, doggoEmbed('🚪 Miembro salió', replaceMemberText(config.goodbyeMessage, member, member.guild), 0x95a5a6, '🚪 DESPEDIDA').setThumbnail(member.user.displayAvatarURL()), member.toString());
});
client.on('error', (error) => console.error('Discord client error', error));
await client.login(env.DISCORD_TOKEN);
