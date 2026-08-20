import Fastify from 'fastify';
import { env } from '@doggo/config';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ service: 'doggo-dashboard', status: 'ok' }));

await app.listen({ host: '127.0.0.1', port: env.DASHBOARD_PORT });
