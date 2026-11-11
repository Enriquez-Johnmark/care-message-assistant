#!/usr/bin/env bash
# Makes the screenshots and the walkthrough in docs/showcase/ on a fresh
# database: the made-up clinic and its staff, the 30-message inbox on HAPI
# FHIR, and Claude's drafts replayed from the recordings (no key, no cost).
# Needs Postgres, Mailpit and HAPI FHIR (docker compose --profile fhir up -d),
# a built web app and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."

db=care_messages_showcase
admin_url="${DATABASE_URL:-postgres://care_messages:care_messages@localhost:5432/care_messages}"
psql_admin() { docker compose exec -T postgres psql -q -U care_messages -d postgres -c "$1" 2>/dev/null \
  || psql "$admin_url" -q -c "$1"; }
psql_admin "drop database if exists $db with (force)"
psql_admin "create database $db"
export DATABASE_URL="${admin_url%/*}/$db"
export PUBLIC_BASE_URL=http://127.0.0.1:3006 BIND_ADDR=127.0.0.1:3006 WORKER_TICK_SECS=3600
pnpm -s cli migrate >/dev/null
pnpm -s cli add-staff --email dr.lee@clinic.example.test --name "Dr. Example Lee" --role clinician >/dev/null
pnpm -s cli add-staff --email desk@clinic.example.test --name "Example Front Desk" --role front-desk >/dev/null
pnpm -s cli add-staff --email admin@clinic.example.test --name "Example Administrator" --role administrator >/dev/null
pnpm -s cli load-made-up >/dev/null
curl -s -X DELETE http://127.0.0.1:8025/api/v1/messages >/dev/null

OWNER_ANTHROPIC_API_KEY= pnpm -s cli serve --recorded >showcase-server.log 2>&1 &
server=$!
trap 'kill $server' EXIT
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:3006/health >/dev/null && break; sleep 1; done

(cd web && pnpm exec playwright test --config showcase/playwright.config.ts --trace off)
