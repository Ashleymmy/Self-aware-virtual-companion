#!/bin/bash
# Wake OpenClaw gateway to trigger pending cron jobs
curl -s -X POST http://127.0.0.1:18789/api/cron/wake \
  -H "Content-Type: application/json" \
  -d '{"mode":"now"}' \
  > /dev/null 2>&1

# Fallback: poke the gateway to ensure it's alive
curl -s http://127.0.0.1:18789/ > /dev/null 2>&1
