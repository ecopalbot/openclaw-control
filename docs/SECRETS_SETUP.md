# Secrets Setup

## Secret Locations

| Secret             | Location           | Who Reads It                         |
| ------------------ | ------------------ | ------------------------------------ |
| LLM API keys       | `~/.openclaw/.env` | OpenClaw directly                    |
| Gateway token      | `~/.openclaw/.env` | OpenClaw auth                        |
| Telegram bot token | `~/.openclaw/.env` | OpenClaw channels.telegram           |
| Supabase keys      | `~/.openclaw/.env` | Dashboard server, proxy, seed script |
| Hard budget limits | `~/.openclaw/.env` | Proxy middleware                     |

## Generation

```bash
# Gateway token
openssl rand -hex 32

# Telegram bot token
# Create via @BotFather on Telegram

# Telegram owner ID
# Send /start to @userinfobot on Telegram
```

## Key Rotation

1. Generate new key
2. Update `~/.openclaw/.env` on VPS
3. Restart affected service: `sudo systemctl restart openclaw`
4. Test immediately
5. Revoke old key at provider

## Safety Rules

- `.env` is gitignored — never committed
- `.env.example` has empty placeholders only
- No secrets in `openclaw.json` — uses `${VAR}` references
- Supabase anon key is read-only (dashboard frontend)
- Supabase service key is server-side only (dashboard API, proxy, seed)
