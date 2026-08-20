import { REST, Routes } from 'discord.js';
import { env } from '@doggo/config';
import { commandData } from './commands.js';

if (!env.DISCORD_GUILD_ID) {
  throw new Error('DISCORD_GUILD_ID es obligatorio para registrar comandos en desarrollo.');
}

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
  { body: commandData }
);

await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: [] });

console.log(`Registered ${commandData.length} functional command(s) in guild ${env.DISCORD_GUILD_ID}.`);