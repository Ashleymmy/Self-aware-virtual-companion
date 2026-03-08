# SAVC Container Preset (Cloud-Ready Placeholder)

This folder provides a reserved container baseline for future cloud deployment.
It is intended for development staging and should be hardened before production.

## Quick Start

```bash
bash scripts/dev_container.sh init-env
# edit infra/docker/.env
bash scripts/dev_container.sh up

# optional: also start proactive daemon
COMPOSE_PROFILES=automation bash scripts/dev_container.sh up
```

## Files

- `docker-compose.cloud.yml`: gateway + savc-ui compose preset (optional automation profile)
- `openclaw.container.json`: container-side OpenClaw bootstrap config
- `.env.example`: environment template for container runtime
- `bootstrap/empty-credentials`: placeholder bind mount target when you do not sync host approvals

## Notes

- The first container boot copies `openclaw.container.json` into `/home/node/.openclaw/openclaw.json`.
- The repo is mounted at `/workspace`; SAVC workspace path is `/workspace/savc-core`.
- Default services are `savc-gateway` and `savc-ui`; `savc-proactive` is available via `COMPOSE_PROFILES=automation`.
- Set `OPENCLAW_HOST_CREDENTIALS_DIR` to your host `~/.openclaw/credentials` if you want Docker to inherit existing pairing approvals/allowlists.
- For production cloud deployment, replace local bind mounts with image-based artifacts and secrets manager integration.
