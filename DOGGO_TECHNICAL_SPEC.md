# Doggo: Especificación técnica del bot multipropósito

**Versión:** 1.0
**Nombre:** Doggo
**Identidad:** asistente robótico-canino premium, inteligente, moderno y ultra eficiente.
**Avatar:** perrito marrón en pixel art.
**Idioma operativo:** respuestas configurables por servidor; interfaz y comandos en inglés.
**Objetivo:** ofrecer moderación, comunidad, soporte, automatización e IA sobre una plataforma distribuida, segura y preparada para grandes volúmenes.

## Principios de diseño

- **Discord-first:** Slash Commands, botones, menús, modales, permisos nativos y Gateway Intents mínimos.
- **Multi-tenant:** cada servidor (guild) es un tenant aislado por `guild_id`.
- **Event-driven:** los eventos de Discord se normalizan y se publican en una cola; ningún handler pesado bloquea el Gateway.
- **Consistencia donde importa:** sanciones, permisos, tickets y expiraciones usan transacciones e idempotencia.
- **Privacidad por defecto:** reportes anónimos, transcripts y prompts con retención configurable y acceso restringido.
- **Degradación elegante:** si Redis, el proveedor LLM o un worker fallan, las funciones no relacionadas continúan operativas.

## Arquitectura de referencia

```text
Discord Gateway/REST
        |
   Shard Managers
        |
  Event Router / API Gateway
   |        |        |
Workers  Commands  Web Dashboard
   |        |        |
Redis + BullMQ   PostgreSQL   Object Storage
                         |
                  Audit/Analytics
```

### Componentes

1. **Gateway shards:** conexiones WebSocket separadas según la distribución de guilds. Un `Shard Manager` coordina sesiones, heartbeats, resumes y límites de Discord.
2. **Command service:** registra comandos globales o por guild, valida permisos, aplica rate limits y crea jobs para operaciones largas.
3. **Event router:** transforma eventos de Discord a eventos internos versionados, por ejemplo `guild.member.joined.v1`.
4. **Workers:** procesos stateless para transcripts, captcha, contadores, expiraciones, IA, moderación y sincronización de roles.
5. **PostgreSQL:** fuente de verdad para configuración, usuarios, sanciones, tickets, votos, expiraciones y auditoría.
6. **Redis:** caché de configuración y estado caliente, locks distribuidos, deduplicación, rate limits y colas BullMQ/Streams.
7. **Object storage:** S3-compatible para transcripts y evidencias; nunca se guardan binarios grandes dentro de PostgreSQL.
8. **Dashboard API:** API REST o GraphQL detrás de OAuth2; no expone el token del bot al navegador.
9. **Observabilidad:** métricas Prometheus, logs estructurados, trazas OpenTelemetry y alertas por latencia, errores y lag de shards.

### Stack recomendado

- TypeScript con `discord.js` o una librería equivalente con soporte de sharding.
- Fastify/NestJS para APIs y workers separados del proceso Gateway.
- PostgreSQL 16 con particionado para eventos, mensajes y auditoría.
- Redis Cluster con BullMQ, Streams o un scheduler equivalente.
- S3/MinIO para adjuntos y transcripts.
- Docker/Kubernetes, HPA y despliegues rolling o blue/green.

## 1. MÓDULO DE CONFIGURACIÓN Y ADMINISTRACIÓN

### Comandos

```text
/setup
/config view
/config set <key> <value>
/config reset <key>
/module enable <module>
/module disable <module>
/role set <name> <role>
/channel set <purpose> <channel>
/locale set <language>
```

`<key>`, `<module>`, `<purpose>` y `<name>` son obligatorios. Solo pueden ejecutar estos comandos administradores o roles configurados con la capacidad equivalente.

### Funcionamiento

`/setup` crea o detecta categorías, canales, roles y permisos sin sobrescribir recursos existentes. Cada cambio se valida contra una allowlist de claves y se registra en `audit_events`. La configuración efectiva se guarda en PostgreSQL y se invalida en Redis mediante `config:{guild_id}`.

El bot usa permisos mínimos: `ViewChannel`, `SendMessages`, `EmbedLinks`, `ManageChannels`, `ManageRoles`, `ModerateMembers`, `KickMembers`, `BanMembers`, `ReadMessageHistory` y `AttachFiles` solo cuando un módulo lo requiere. Nunca se permite que el rol del bot esté por debajo de roles que deba administrar.

## 2. MÓDULO DE MODERACIÓN Y AUTOMOD

### Comandos

```text
/moderation status
/timeout <user> <duration> [reason]
/kick <user> [reason]
/clear <amount> [user]
/slowmode <channel> <seconds>
/lock <channel> [reason]
/unlock <channel>
/automod enable <rule>
/automod disable <rule>
```

`<user>`, `<duration>`, `<amount>` y `<rule>` son obligatorios cuando aparecen. El módulo intercepta mensajes mediante reglas de spam, flood, enlaces, palabras, menciones masivas y cuentas nuevas. Cada acción devuelve un `case_id`, escribe una auditoría inmutable y respeta excepciones por rol, canal y usuario.

Los moderadores reciben una respuesta efímera cuando la acción es sensible. La aplicación se ejecuta con una operación idempotente: si Discord confirma el castigo pero la respuesta se pierde, reintentar no crea otro caso.

## 3. MÓDULO DE NIVELES, XP Y PERFIL

### Comandos

```text
/profile [user]
/rank [user]
/leaderboard [page]
/levels set <enabled> <xp_per_message>
/levels rewards add <level> <role>
/levels rewards remove <level>
```

Cada mensaje elegible genera XP con cooldown por usuario, exclusión de bots y límites diarios. El cálculo es transaccional para evitar doble recompensa al recibir eventos duplicados. Redis conserva el ranking caliente; PostgreSQL mantiene el total durable.

`/profile` muestra avatar, nivel, XP, insignias positivas y, únicamente a miembros con permiso de staff, la sección **Historial de Infracciones** definida en el módulo 13. Las recompensas de rol se entregan mediante jobs reintentables.

## 4. MÓDULO DE ECONOMÍA Y RECOMPENSAS

### Comandos

```text
/balance [user]
/daily
/pay <user> <amount>
/shop list
/shop buy <item>
/economy set <currency_name> <daily_amount>
```

Los saldos se modifican con ledger append-only, no con simples asignaciones. Cada movimiento tiene `transaction_id`, actor, origen, cantidad y saldo resultante. Se rechazan cantidades negativas, overflow, duplicados y operaciones sin saldo. El staff puede consultar, congelar o corregir una cuenta mediante un flujo auditado.

## 5. MÓDULO DE UTILIDADES Y AUTOMATIZACIÓN

### Comandos

```text
/remind <time> <message>
/poll create <question> <duration>
/poll close <poll_id>
/translate <language> <text>
/announce <channel> <message>
/roleme <role>
```

Los recordatorios y cierres de encuestas se almacenan como jobs con `run_at`, zona horaria, reintentos y estado. Los botones usan identificadores versionados y firmados por contexto de guild. Mensajes masivos pasan por rate limiting y una cola para no bloquear comandos interactivos.

## 6. MÓDULO DE BIENVENIDA, ROLES Y EVENTOS

### Comandos

```text
/welcome setup <channel> <message>
/welcome test
/goodbye setup <channel> <message>
/autorole set <role>
/event create <name> <start_time> <description>
/event cancel <event_id>
```

Al entrar un miembro, el worker carga la configuración, aplica el flujo de verificación si está activo y solo después entrega el rol público. Los eventos se publican con embeds y botones; todas las fechas se guardan en UTC y se presentan en la zona horaria del servidor.

## 7. MÓDULO DE TICKETS DE SOPORTE

### Comandos e interacciones

```text
/ticket panel <channel>
/ticket close
/ticket add <user>
/ticket remove <user>
/ticket claim
/ticket reopen <ticket_id>
/ticket config category <type> <category>
/ticket config logs <channel>
```

Tipos obligatorios: `support`, `reports` y `purchases`. `/ticket panel <channel>` publica un embed con botones **Support**, **Reports** y **Purchases/Donations**. Al pulsarlo:

1. Se verifica que el usuario no tenga un ticket abierto del mismo tipo.
2. Se inserta el ticket en estado `creating` con una clave idempotente.
3. Se crea un canal privado como `ticket-001` dentro de la categoría configurada.
4. Se aplican overwrites para `@everyone`, creador y roles de soporte.
5. Se publica el embed inicial con botones `Claim`, `Add User` y `Close`.

`/ticket close` requiere el creador, un miembro añadido o staff. El bot cambia el estado a `closing`, pagina el historial con `Get Channel Messages`, genera un transcript TXT/HTML con autor, ID, timestamp, contenido y enlaces de adjuntos, lo sube a object storage y envía el archivo o URL firmada al canal de logs. Después bloquea el canal y lo archiva o elimina según retención. Las URLs firmadas caducan y los transcripts se borran automáticamente según la política del guild.

## 8. MÓDULO DE VERIFICACIÓN ANTI-BOTS

### Comandos

```text
/verification setup <channel> <method>
/verification role <role>
/verification reset <user>
/verification status [user]
```

`<method>` acepta `button`, `captcha` o `dm`. El flujo recomendado es un canal de entrada visible para no verificados:

1. `guild.member.add` crea un registro `pending` y aplica un rol restringido.
2. El bot presenta un botón o un modal CAPTCHA con token de un solo uso, expiración corta y límite de intentos.
3. En modo DM, se exige que el usuario pueda recibir mensajes; si falla, se muestra un enlace al canal.
4. El backend valida el desafío, registra IP/hash de riesgo solo si la política lo permite y evita almacenar la respuesta CAPTCHA.
5. Una transacción marca al usuario como `verified`, asigna `Verified` y retira el rol restringido.

Se añade protección anti-raid: límite de altas por ventana, cuarentena, bloqueo temporal de invitaciones, account-age rules y alertas a staff. El CAPTCHA no sustituye las herramientas nativas de Membership Screening; ambos flujos pueden combinarse.

## 9. MÓDULO DE INTELIGENCIA ARTIFICIAL CANINA

### Comandos

```text
/ask <prompt>
/ask clear
/ai config <provider> <model>
/ai enable
/ai disable
```

También se activa al mencionar a Doggo, siempre que la IA esté habilitada en el guild. El `AI Gateway` normaliza el proveedor LLM, aplica límites por usuario/guild, elimina o enmascara secretos y conserva solo el contexto mínimo necesario. Las llamadas se ejecutan en una cola con timeout y circuit breaker.

El system prompt fija la personalidad: asistente canino robótico, preciso, amable, con humor breve y sin afirmar capacidades inexistentes. No se permite que el modelo ejecute comandos directamente: puede proponer una acción estructurada, pero el bot vuelve a validar permisos y parámetros antes de efectuarla. Los recordatorios se crean mediante una herramienta interna con schema estricto.

La configuración incluye proveedor, modelo, temperatura, máximo de tokens, canales permitidos, retención y opt-out. El contenido enviado al proveedor se trata como dato potencialmente sensible; se informa al administrador, se evita usarlo para entrenamiento cuando el proveedor lo permita y se ofrece borrado.

## 10. MÓDULO DE REPORTES Y SUGERENCIAS

### Comandos

```text
/suggest <title> <description>
/report <user> <description> [evidence]
/report status <report_id>
/report close <report_id> <resolution>
/suggest config <channel>
/report config <channel> <anonymous>
```

`/suggest` publica un embed en el canal configurado con botones 👍 y 👎, contador persistente y un usuario solo puede votar una vez por sugerencia. El voto puede cambiarse y se guarda como upsert en `suggestion_votes`.

`/report` abre un modal para la descripción y permite URL o adjuntos. El mensaje de confirmación es efímero. El canal de destino tiene overwrites solo para staff. En modo anónimo, el embed no revela al reportante a moderadores generales, aunque el ID interno se conserva cifrado o con acceso de auditoría para investigar abuso. Evidencias se escanean por tamaño, MIME y malware antes de almacenarse.

## 11. MÓDULO DE ESTADÍSTICAS EN VIVO

### Comandos

```text
/counters setup <category>
/counters enable
/counters disable
/counters refresh
/stats [period]
```

`/counters setup` crea canales de voz bloqueados, por ejemplo:

```text
👥 Members: 1,540
💬 Messages Today: 300
🎙️ In Voice: 25
```

Un worker ejecuta la actualización cada 10 minutos con jitter para repartir carga entre guilds. La métrica de miembros proviene del estado de Discord o de una reconciliación periódica; mensajes diarios se agregan desde eventos normalizados y se corrigen con jobs de consistencia. Los cambios de nombre se comparan antes de llamar a la API para evitar rate limits. Un lock por `guild_id` impide que dos workers actualicen el mismo contador.

## 12. INFRAESTRUCTURA DE DATOS Y DASHBOARD WEB

### OAuth2 y dashboard

El administrador entra al dashboard con Discord OAuth2 usando `identify` y `guilds`. El backend valida el `state` anti-CSRF, usa PKCE cuando el flujo lo soporte, intercambia el código server-side y nunca expone client secrets. Para editar un guild se consulta la pertenencia y se comprueba `MANAGE_GUILD` o un permiso equivalente; la UI solo muestra guilds administrables.

La API del dashboard usa sesiones HttpOnly, Secure, SameSite, rotación de refresh tokens, CSRF protection, CORS allowlist, validación de schemas y rate limits. Cada mutación incluye `guild_id`, actor, versión de configuración e `idempotency_key`. WebSockets o Server-Sent Events pueden reflejar cambios, pero PostgreSQL sigue siendo la fuente de verdad.

### Redis y escalabilidad

Redis no es almacenamiento permanente. Se usan claves con TTL y namespaces:

```text
config:{guild_id}
ratelimit:{guild_id}:{user_id}:{command}
lock:ticket:{guild_id}:{ticket_key}
member-count:{guild_id}
conversation:{guild_id}:{channel_id}
```

- **Caché de configuración:** lectura rápida con invalidación por evento de cambio.
- **Rate limiting:** token bucket distribuido por guild, usuario y comando.
- **Deduplicación:** `event:{discord_event_id}` con TTL evita procesar reintentos.
- **Colas:** BullMQ/Streams separan recepción de eventos y trabajo pesado.
- **Locks:** TTL corto, renovación y fencing token para evitar doble ejecución.
- **Mensajes:** no se cachean millones de mensajes completos indefinidamente; se agregan métricas y se conserva solo el contexto IA necesario.

Para millones de mensajes, los eventos se escriben en batches, las tablas se particionan por guild/mes y las consultas analíticas se replican a un almacén columnar cuando el volumen lo justifique. El Gateway nunca espera a PostgreSQL ni al LLM. Backpressure, circuit breakers y colas con dead-letter queue mantienen el bot receptivo.

### Modelo de datos mínimo

- `guilds(id, discord_id, plan, locale, created_at)`
- `guild_configs(guild_id, key, value_json, version, updated_by)`
- `members(guild_id, discord_id, xp, level, verified_at)`
- `tickets(id, guild_id, channel_id, creator_id, type, status, transcript_uri)`
- `reports(id, guild_id, reporter_id, target_id, anonymous, description, evidence_uri, status)`
- `suggestions(id, guild_id, author_id, title, description, status)`
- `suggestion_votes(suggestion_id, user_id, value)`
- `sanctions(id, guild_id, public_id, target_id, moderator_id, type, mode, reason, evidence_uri, starts_at, expires_at, status)`
- `sanction_thresholds(guild_id, warn_count, action, duration)`
- `audit_events(id, guild_id, actor_id, action, entity_id, payload_json, created_at)`
- `jobs(id, kind, dedupe_key, run_at, attempts, status)`

Las claves únicas recomendadas son `(guild_id, public_id)`, `(guild_id, channel_id, status)` para tickets abiertos y `(guild_id, discord_event_id)` para eventos.

## 13. MÓDULO ULTRA AVANZADO DE SANCIONES Y EMBLEMAS DE HISTORIAL

### Comandos

```text
/sanctions setup <channel>
/sanctions config threshold <warn_count> <action> [duration]
/warn <user> <reason> [evidence]
/mute temp <user> <duration> <reason> [evidence]
/mute perm <user> <reason> [evidence]
/unmute <user> [sanction_id] [reason]
/ban perm <user> <reason> [evidence]
/ban temp <user> <duration> <reason> [evidence]
/unban <user> [sanction_id] [reason]
/kick <user> <reason> [evidence]
/profile [user]
```

En comandos de moderación, `<user>`, `<reason>` y los subcomandos indicados son obligatorios. `<evidence>` acepta URL validada o archivo adjunto. La evidencia se copia a object storage con hash, MIME, tamaño y política de retención; el embed usa una URL segura o una miniatura compatible.

### `/sanctions setup`

Configura el canal público o privado de logs. El bot comprueba que el canal sea accesible, guarda su ID y publica una prueba efímera. El modo de visibilidad se configura por separado: `staff_only` es el valor recomendado. Los embeds públicos deben evitar datos que expongan información sensible; los detalles completos pueden quedar en el registro restringido.

### Ejecución común

1. Se valida jerarquía de roles, permisos, que el objetivo no sea el owner y que el moderador tenga capacidad para la acción.
2. Se normalizan duración, razón y evidencia. Las duraciones aceptan `1h`, `12h`, `3d`, `7d` y `30d`, con máximo configurable.
3. Se crea la sanción en una transacción con ID pública secuencial o aleatoria, por ejemplo `#SANC-0842`.
4. Se ejecuta la acción Discord con idempotency key. Para mute temporal se usa Discord Timeout; para mute permanente se administra el rol `Muteadito`.
5. Se publica el embed y se registra auditoría. Si Discord falla, la transacción queda `pending_action` para reintento y no se presenta como aplicada.
6. Se notifica al usuario por DM cuando sea posible; el fallo del DM no revierte una sanción válida.

### Embed obligatorio

Cada sanción aplicada publica un embed pixel-art con:

- **Sanction ID:** `#SANC-0842`
- **Sanctioned member:** mención, nombre visible e ID de Discord
- **Moderator:** mención e ID
- **Reason:** razón completa, limitada y saneada
- **Evidence:** enlace o imagen adjunta, si existe
- **Type:** `Warn`, `Mute`, `Kick` o `Ban`
- **Status:** `Active`, `Expired`, `Removed` o `Failed`
- **Time:** inicio y expiración en UTC, cuando aplique

El branding usa color y footer consistentes con Doggo, sin alterar la semántica de los campos. El contenido se escapa para evitar menciones no deseadas y se desactiva `allowed_mentions` salvo la mención explícita del objetivo cuando la política del guild lo autorice.

### Tipos y expiración

- **Permanent ban:** `/ban perm` ejecuta ban indefinido y guarda el ID bloqueado.
- **Temporary ban:** `/ban temp` ejecuta ban, almacena `expires_at` y desbanea automáticamente al vencer.
- **Warn:** `/warn` crea un emblema activo y aumenta el contador sujeto a la política del guild.
- **Temporary mute:** `/mute temp` aplica Timeout con la duración admitida por Discord y registra expiración.
- **Permanent mute:** `/mute perm` asigna `Muteadito`, configurado con deny de `SendMessages`, `Speak`, `AddReactions` y permisos equivalentes en canales nuevos y existentes.
- **Kick:** `/kick` expulsa y deja evidencia auditable, sin crear expiración.

Un scheduler distribuido consulta `sanctions WHERE status='active' AND expires_at <= now()` en lotes pequeños. Usa `SELECT ... FOR UPDATE SKIP LOCKED`, marca el job, ejecuta `unban` o retira Timeout/estado temporal y finalmente marca la sanción `expired`. Un proceso de reconciliación compara PostgreSQL con Discord después de reinicios. El sistema no depende de un único proceso en memoria.

`/unban` y `/unmute` marcan el registro como `removed`, guardan quién lo hizo y actualizan el embed original. Si la acción manual sucede después de que el job empezó, la transición se resuelve con una máquina de estados y versionado optimista para impedir que un job tardío restaure una sanción.

### Perfil y emblemas negativos

`/profile` muestra a staff una sección **Historial de Infracciones** con ID pública, tipo, razón resumida, fecha y estado. Los emblemas activos se destacan; los expirados o removidos permanecen visibles como historial pero no cuentan para nuevas escaladas. El usuario normal solo ve la información que el administrador haya configurado como pública.

### Acumulación automática

`/sanctions config threshold 3 mute 24h` configura el ejemplo de tres warns. Después de crear un warn, una transacción calcula el número de warns activos y crea una sanción automática si se alcanza el umbral. La acción automática incluye como razón las IDs que la originaron, publica su propio embed y usa una clave de deduplicación como `threshold:{guild}:{target}:{threshold}:{window}`. Los umbrales pueden escalar, por ejemplo: 3 warns = mute 24h; 5 warns = ban 7d. El staff debe poder desactivar o revisar cada política.

## Seguridad, permisos y privacidad transversal

- Validar todos los inputs con schemas y limitar longitudes, adjuntos, URLs, menciones y duración.
- Usar `allowed_mentions: { parse: [] }` por defecto.
- Cifrar secretos con KMS/Vault; rotar tokens y separar credenciales por entorno.
- Aplicar least privilege en bot, dashboard, workers, buckets y bases de datos.
- Registrar actor, guild, acción, resultado, request ID y razón sin almacenar contenido innecesario.
- Definir retención por guild para transcripts, reportes, evidencias, prompts y auditoría.
- Implementar borrado/exportación conforme a la política de privacidad aplicable.
- Verificar firma de interacciones y rechazar componentes expirados, de otro guild o de otro usuario cuando corresponda.
- Proteger webhooks, endpoints internos y callbacks OAuth2 contra SSRF y replay.

## Observabilidad, disponibilidad y operación

### SLO inicial

- Respuesta de comandos interactivos: p95 menor de 2 segundos.
- Reconocimiento de eventos Gateway: p99 menor de 1 segundo.
- Expiraciones: p99 menor de 5 segundos después de `expires_at`, sujeto a límites de Discord.
- Disponibilidad del API dashboard: 99.9% mensual.

### Métricas y alertas

Medir latencia de comandos, errores REST, rate limits, reconnects, heartbeat ACK, shard lag, profundidad de colas, dead-letter jobs, cache hit ratio, tiempo de creación de tickets, expiraciones atrasadas y coste/token de IA. Alertar cuando un shard pierda heartbeats, una cola crezca sostenidamente o falle la reconciliación de sanciones.

### Pruebas y despliegue

- Unit tests para parsers de duración, permisos, thresholds, dedupe y estados.
- Integration tests con Discord mocks para tickets, sanciones, componentes y expiraciones.
- Contract tests para Dashboard API, OAuth2 y schemas de eventos.
- Load tests de Gateway router, Redis, PostgreSQL y colas con guilds y mensajes sintéticos.
- Pruebas de recuperación: reinicio durante sanción, pérdida de Redis, duplicación de eventos y caída del proveedor IA.
- Migraciones backward-compatible, feature flags por guild y rollback de aplicación sin rollback destructivo de datos.

## Criterios de aceptación

1. Cada comando documentado aparece registrado con permisos, parámetros y respuesta de error.
2. Ninguna operación larga bloquea el Gateway; todas tienen timeout, retry y dead-letter policy.
3. Tickets, reportes y sanciones dejan auditoría y respetan privacidad y retención.
4. Una sanción temporal sobrevive a reinicios y se expira mediante job distribuido y reconciliación.
5. `/profile` diferencia claramente emblemas activos de expirados/removidos y oculta el historial a usuarios sin permiso.
6. El dashboard solo permite configurar guilds autorizados mediante Discord OAuth2 válido.
7. Redis acelera lecturas y coordinación, pero la pérdida completa de Redis no causa pérdida de datos.
8. La configuración por guild evita que acciones, canales, roles o datos crucen tenants.
9. La operación muestra métricas suficientes para diagnosticar lag, rate limits, colas y fallos de Discord.
