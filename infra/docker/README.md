# SAVC Container Preset (Cloud-Ready Placeholder)

This folder provides a reserved container baseline for future cloud deployment.
It is intended for development staging and should be hardened before production.

## Quick Start

```bash
bash scripts/dev_container.sh init-env
# edit infra/docker/.env
bash scripts/dev_container.sh up
```

## Files

- `docker-compose.cloud.yml`: gateway container preset
- `openclaw.container.json`: container-side OpenClaw bootstrap config
- `.env.example`: environment template for container runtime

## Notes

- The first container boot copies `openclaw.container.json` into `/home/node/.openclaw/openclaw.json`.
- The repo is mounted at `/workspace`; SAVC workspace path is `/workspace/savc-core`.
- For production cloud deployment, replace local bind mounts with image-based artifacts and secrets manager integration.
