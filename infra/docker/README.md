# SAVC Container Preset (Cloud-Ready Placeholder)

This folder provides a reserved container baseline for future cloud deployment.
It is intended for development staging and should be hardened before production.

## Quick Start

```bash
bash scripts/infra/dev_container.sh init-env
# edit infra/docker/.env
bash scripts/infra/dev_container.sh up

# optional: also start proactive daemon
COMPOSE_PROFILES=automation bash scripts/infra/dev_container.sh up
```

## Files

- `docker-compose.cloud.yml`: gateway + savc-ui compose preset (optional automation profile)
- `docker-compose.prod.yml`: production-oriented compose preset with file-backed secrets and lazy runtime dependency install
- `openclaw.container.json`: container-side OpenClaw bootstrap config
- `.env.example`: environment template for container runtime
- `.env.prod.example`: production env template (prefers `*_FILE` secrets)
- `.env.prod.sample`: production filled example with placeholder values and file-backed secret paths
- `bootstrap/empty-credentials`: placeholder bind mount target when you do not sync host approvals

## Notes

- The first container boot copies `openclaw.container.json` into `/home/node/.openclaw/openclaw.json`.
- `docker-compose.cloud.yml` bind-mounts the repo at `/workspace`; canonical paths are `/workspace/node_modules/.pnpm/node_modules/openclaw`, `/workspace/packages/core`, `/workspace/packages/plugin`, `/workspace/packages/ui`.
- `docker-compose.prod.yml` copies the repo into the image, then installs dependencies on first container boot when `/workspace/node_modules/.pnpm/node_modules/openclaw/openclaw.mjs` is missing.
- Default services are `savc-gateway` and `savc-ui`; `savc-proactive` is available via `COMPOSE_PROFILES=automation`.
- `savc-ui` now proxies gateway traffic through the Vite server, so browser clients no longer need `VITE_SAVC_GATEWAY_TOKEN`.
- Set `OPENCLAW_HOST_CREDENTIALS_DIR` to your host `~/.openclaw/credentials` if you want Docker to inherit existing pairing approvals/allowlists.
- If you want Discord server-channel auto-replies, set both `DISCORD_GUILD_ID` and `DISCORD_CHANNEL_ID`; `scripts/setup.sh` will emit a channel allowlist entry with `requireMention=false` for that target channel.
- `docker-compose.prod.yml` now avoids building the vendored `openclaw/` snapshot during image build; it resolves `OPENCLAW_ROOT` to the installed pnpm package path instead.
- To let yuanyuan drive Codex on a cloud host, enable `SAVC_CODEX_ACP_ENABLE=1`. `api-key` mode still works via `OPENAI_API_KEY` / `OPENAI_API_KEY_FILE`; `auth` mode can instead mount a logged-in host `auth.json` via `SAVC_HOST_CODEX_AUTH_FILE`.
- For production self-development, point `SAVC_HOST_DEV_WORKSPACE_DIR` at a persistent repo checkout and keep `SAVC_CODEX_ACP_CWD=/workspace-devrepo`.
- `SAVC_HOST_CODEX_HOME_DIR` is a bind mount for container-side `/home/node/.codex`; keep it separate from your host `~/.codex` if the host config points at local-only endpoints.
- `SAVC_HOST_CODEX_AUTH_FILE` lets production reuse only the host `auth.json` login state without also inheriting the host `config.toml`.
- `scripts/runtime/codex_acp_auth_full_access.sh` is the production wrapper for Codex ACP auth mode; it forces `approval_policy="never"` and `sandbox_mode="danger-full-access"` for headless full-access automation.

## Production

```bash
mkdir -p infra/docker/secrets
bash scripts/infra/prod_container.sh init-env
# or copy the filled example:
# cp infra/docker/.env.prod.sample infra/docker/.env.prod
# edit infra/docker/.env.prod and populate infra/docker/secrets/*
bash scripts/infra/prod_container.sh validate
bash scripts/infra/prod_container.sh up
```

- Prefer `*_FILE` env vars that point to files under `infra/docker/secrets/` or your cloud secret mount.
- Keep `VITE_SAVC_GATEWAY_URL=/gateway`; the UI server injects gateway auth server-side.
