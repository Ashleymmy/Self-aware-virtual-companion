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
- `docker-compose.prod.yml`: production-oriented compose preset with source-free images and file-backed secrets
- `openclaw.container.json`: container-side OpenClaw bootstrap config
- `.env.example`: environment template for container runtime
- `.env.prod.example`: production env template (prefers `*_FILE` secrets)
- `.env.prod.sample`: production filled example with placeholder values and file-backed secret paths
- `bootstrap/empty-credentials`: placeholder bind mount target when you do not sync host approvals

## Notes

- The first container boot copies `openclaw.container.json` into `/home/node/.openclaw/openclaw.json`.
- The repo is mounted at `/workspace`; canonical paths are `/workspace/openclaw`, `/workspace/packages/core`, `/workspace/packages/plugin`, `/workspace/packages/ui`.
- Default services are `savc-gateway` and `savc-ui`; `savc-proactive` is available via `COMPOSE_PROFILES=automation`.
- `savc-ui` now proxies gateway traffic through the Vite server, so browser clients no longer need `VITE_SAVC_GATEWAY_TOKEN`.
- Set `OPENCLAW_HOST_CREDENTIALS_DIR` to your host `~/.openclaw/credentials` if you want Docker to inherit existing pairing approvals/allowlists.
- For production cloud deployment, replace local bind mounts with image-based artifacts and secrets manager integration.
- To let yuanyuan drive Codex on a cloud host, enable `SAVC_CODEX_ACP_ENABLE=1` and provide `OPENAI_API_KEY` / `OPENAI_API_KEY_FILE`.
- For production self-development, point `SAVC_HOST_DEV_WORKSPACE_DIR` at a persistent repo checkout and keep `SAVC_CODEX_ACP_CWD=/workspace-devrepo`.
- `SAVC_HOST_CODEX_HOME_DIR` is an optional bind mount for `/home/node/.codex`; it lets you persist Codex CLI local config, but remote/cloud runs should still prefer API key auth.

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
