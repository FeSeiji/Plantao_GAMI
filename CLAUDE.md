# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plantão is a REST API for managing hospital shifts (plantões hospitalares), built with Node.js, Express v5, and Supabase (Auth + database).

## Environment Setup

`SUPABASE_SERVICE_ROLE_KEY` is an admin key — it bypasses row-level security and must never be exposed to clients.

### Local Supabase

Local testing uses the Supabase CLI stack (`supabase start` at the repo root; config in `supabase/config.toml`). `Backend/.env` points at it via `http://host.docker.internal:54321`; production credentials live in `Backend/.env.producao` (gitignored), selectable with `ENV_FILE=.env.producao docker-compose up`.

- `cd Backend && npm run db:reset` — `supabase db reset` (applies `supabase/migrations/`) + `scripts/seed-local.js` (test users with password `senha123`, ~3 months of plantões, trocas, afastamentos, casos fora, fichas). The seed refuses to run against a non-local URL.
- Schema changes: add a new file to `supabase/migrations/` **and** run the same SQL manually in the production SQL Editor (production has no migration tooling).
- `20261015000000_schema_inicial.sql` is a `supabase db dump` of production (public schema only). Triggers on `auth.users` aren't in such dumps, so `on_auth_user_created` is recreated in its own migration.

## Architecture

The placement of `app.use(authMiddleware)` in `app.js` is what separates public from protected routes — all routes registered **before** it are public, all **after** are protected. Exception: `GET /auth/me` is mounted under `/auth` (before the global `authMiddleware`), so it applies `authMiddleware` directly on the route in `routes/auth.js`.

`GET /health` (public) does a light `profiles` query (503 if the DB fails). It exists for an external uptime monitor that keeps Render's free instance awake.

### Roles System

Roles live in `app_metadata.roles` on the Supabase user (not `user_metadata`): `escritorio`, `tecnico`, `anestesita_socio`, `anestesita_plantonista` (spelled "anestesita" in code). Admin is not a role — it's the separate flag `app_metadata.is_admin`; `requireRole('admin')` matches users with that flag. Only the service role key can set/modify them — user JWTs cannot.

### Unused Files

- `Backend/supabase.js` uses ESM syntax (`import`/`export`) and is not imported anywhere — all active code in `src/` uses CommonJS (`require`/`module.exports`).
- `src/routes/index.js` is not imported in `app.js` — `app.js` imports route files directly. It also requires controllers that don't exist (`healthController`, `hello`, `hospital`), so it would crash if mounted.
