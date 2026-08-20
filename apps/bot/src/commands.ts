import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const command = (name: string, description: string) =>
  new SlashCommandBuilder().setName(name).setDescription(description);

export const commandData = [
  command('ping', 'Comprueba si Doggo esta online.'),
  command('help', 'Muestra los comandos funcionales de Doggo.'),
  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura el AutoMod basico.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Activa AutoMod en un canal.').addChannelOption((option) => option.setName('channel').setDescription('Canal de logs').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('off').setDescription('Desactiva AutoMod.'))
    .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Muestra el estado de AutoMod.')),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestiona tickets de soporte.')
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Configura y publica el sistema de tickets.').addChannelOption((option) => option.setName('channel').setDescription('Canal donde se publica el panel').setRequired(true)).addRoleOption((option) => option.setName('support_role').setDescription('Rol que atendera los tickets').setRequired(true)).addChannelOption((option) => option.setName('category').setDescription('Categoria donde se abriran').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Publica el panel de tickets.').addChannelOption((option) => option.setName('channel').setDescription('Canal del panel').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('cleanup').setDescription('Elimina paneles duplicados del canal.').addChannelOption((option) => option.setName('channel').setDescription('Canal del panel').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('close').setDescription('Cierra el ticket actual.')),
  new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Configura la verificacion de miembros.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Publica el panel de verificacion.').addChannelOption((option) => option.setName('channel').setDescription('Canal de verificacion').setRequired(true)).addRoleOption((option) => option.setName('role').setDescription('Rol que se entrega').setRequired(true))),
  new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Publica una sugerencia con votacion.')
    .addStringOption((option) => option.setName('title').setDescription('Titulo').setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName('description').setDescription('Descripcion').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Envia un reporte privado al staff.')
    .addUserOption((option) => option.setName('user').setDescription('Usuario reportado').setRequired(true))
    .addStringOption((option) => option.setName('description').setDescription('Descripcion de la infraccion').setRequired(true).setMaxLength(1500))
    .addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false)),
  new SlashCommandBuilder()
    .setName('counters')
    .setDescription('Crea contadores de miembros.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Crea los canales contadores.').addChannelOption((option) => option.setName('category').setDescription('Categoria de los contadores').setRequired(true))),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra el perfil y sanciones activas.')
    .addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(false)),
  new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription('Configura el canal de sanciones.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Establece el canal de sanciones.').addChannelOption((option) => option.setName('channel').setDescription('Canal de logs').setRequired(true))),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Advierte a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
    .addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true).setMaxLength(1000))
    .addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false)),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia temporal o permanentemente.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
    .addSubcommand((subcommand) => subcommand.setName('temp').setDescription('Timeout temporal.').addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true)).addStringOption((option) => option.setName('duration').setDescription('Ejemplo: 1h, 12h, 3d').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true)).addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false)))
    .addSubcommand((subcommand) => subcommand.setName('perm').setDescription('Rol Muteadito permanente.').addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true)).addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false))),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Expulsa y bloquea un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers.toString())
    .addSubcommand((subcommand) => subcommand.setName('perm').setDescription('Ban permanente.').addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true)).addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false)))
    .addSubcommand((subcommand) => subcommand.setName('temp').setDescription('Ban temporal.').addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true)).addStringOption((option) => option.setName('duration').setDescription('Ejemplo: 7d, 30d').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true)).addStringOption((option) => option.setName('evidence').setDescription('URL de evidencia').setRequired(false))),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Retira un ban.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers.toString())
    .addStringOption((option) => option.setName('user_id').setDescription('ID de Discord').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retira un mute temporal o permanente.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
    .addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers.toString())
    .addUserOption((option) => option.setName('user').setDescription('Usuario').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Razon').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes recientes.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .addIntegerOption((option) => option.setName('amount').setDescription('Cantidad de 1 a 100').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configura mensajes de bienvenida.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Activa bienvenida.').addChannelOption((option) => option.setName('channel').setDescription('Canal').setRequired(true)).addStringOption((option) => option.setName('message').setDescription('Usa {user} y {server}').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Prueba la bienvenida configurada.')),
  new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configura mensajes de despedida.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Activa despedida.').addChannelOption((option) => option.setName('channel').setDescription('Canal').setRequired(true)).addStringOption((option) => option.setName('message').setDescription('Usa {user} y {server}').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Prueba la despedida configurada.')),
  new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Asigna un rol automáticamente al entrar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles.toString())
    .addSubcommand((subcommand) => subcommand.setName('set').setDescription('Configura el autorol.').addRoleOption((option) => option.setName('role').setDescription('Rol').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('off').setDescription('Desactiva el autorol.')),
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Crea un sorteo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((subcommand) => subcommand.setName('create').setDescription('Crea un sorteo con botón.').addStringOption((option) => option.setName('prize').setDescription('Premio').setRequired(true)).addStringOption((option) => option.setName('duration').setDescription('Ejemplo: 1h, 3d').setRequired(true)).addIntegerOption((option) => option.setName('winners').setDescription('Ganadores').setRequired(true).setMinValue(1).setMaxValue(20)))
    .addSubcommand((subcommand) => subcommand.setName('end').setDescription('Finaliza un sorteo.').addStringOption((option) => option.setName('id').setDescription('ID del sorteo').setRequired(true))),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea una encuesta con botones.')
    .addStringOption((option) => option.setName('question').setDescription('Pregunta').setRequired(true).setMaxLength(500))
    .addStringOption((option) => option.setName('duration').setDescription('Ejemplo: 1h, 1d').setRequired(true)),
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publica un anuncio.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .addChannelOption((option) => option.setName('channel').setDescription('Canal destino').setRequired(true))
    .addStringOption((option) => option.setName('title').setDescription('Titulo').setRequired(true))
    .addStringOption((option) => option.setName('message').setDescription('Mensaje').setRequired(true)),
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Crea un recordatorio.')
    .addStringOption((option) => option.setName('time').setDescription('Ejemplo: 10m, 2h, 1d').setRequired(true))
    .addStringOption((option) => option.setName('message').setDescription('Recordatorio').setRequired(true)),
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Crea un evento del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents.toString())
    .addSubcommand((subcommand) => subcommand.setName('create').setDescription('Crea un evento.').addStringOption((option) => option.setName('name').setDescription('Nombre').setRequired(true)).addStringOption((option) => option.setName('start').setDescription('Fecha ISO').setRequired(true)).addStringOption((option) => option.setName('description').setDescription('Descripcion').setRequired(true)))
].map((builtCommand) => builtCommand.toJSON());
