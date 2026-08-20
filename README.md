# Doggo Platform

Base inicial para un bot Discord multi-servidor y su dashboard. La especificación completa está en [DOGGO_TECHNICAL_SPEC.md](DOGGO_TECHNICAL_SPEC.md).

## Estructura

```text
apps/
  bot/         Gateway, shards y módulos Discord
  dashboard/   API web y OAuth2
packages/
  config/      Validación centralizada de variables de entorno
infra/
  docker/      PostgreSQL, Redis y MinIO local
```

## Preparación

1. Instala Node.js 22 o superior y Docker Desktop.
2. En [Discord Developer Portal](https://discord.com/developers/applications), crea una Application, entra en **Bot**, genera un token nuevo y copia el **Application ID**, el token y el client secret OAuth2.
3. En **OAuth2 > URL Generator**, selecciona los scopes `bot` y `applications.commands`. Invita el bot a un servidor de pruebas con los permisos que necesitan los módulos.
4. Copia `.env.example` a `.env` y completa `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `DISCORD_GUILD_ID` con valores reales. `DISCORD_GUILD_ID` es el ID del servidor de pruebas.
5. Activa en **Bot > Privileged Gateway Intents** los intents que realmente uses. Para el scaffold actual se usa `Guild Members` y `Message Content`.
6. Para los comandos básicos `/ping` y `/help`, PostgreSQL y Redis no son necesarios todavía. Arráncalos cuando actives módulos que usen datos persistentes:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d
```

7. Instala dependencias y comprueba tipos:

```powershell
npm install
npm run typecheck
```

8. Registra los comandos Slash en el servidor de pruebas. Los comandos de guild aparecen casi inmediatamente:

```powershell
npm run deploy:commands --workspace @doggo/bot
```

9. Ejecuta el bot:

```powershell
npm run dev:bot
```

En otra terminal puedes iniciar el dashboard:

```powershell
npm run dev:dashboard
```

Prueba `/ping` y `/help` en el servidor. Para generar JavaScript de producción usa `npm run build`; para iniciar los builds generados deberás añadir procesos gestionados por tu plataforma de despliegue.

Nunca subas `.env` ni tokens reales. Si un token se expone, regénéralo inmediatamente en Discord Developer Portal. Para producción usa secretos administrados, PostgreSQL/Redis gestionados y despliega bot y dashboard como servicios separados.
