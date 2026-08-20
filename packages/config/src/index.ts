import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DISCORD_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().url().default('postgresql://doggo:doggo@localhost:5432/doggo'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  BOT_SHARDS: z.union([z.literal('auto'), z.coerce.number().int().positive()]).default('auto'),
  LLM_PROVIDER: z.string().default('disabled'),
  LLM_API_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().default('doggo'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional()
});

export const env = schema.parse(process.env);
