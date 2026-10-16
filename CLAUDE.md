# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plantão is a REST API for managing hospital shifts (plantões hospitalares), built with Node.js, Express v5, and Supabase (Auth + database).

## Development Commands

```bash
# With Docker (recommended — hot reload via nodemon)
docker-compose up

# Without Docker
cd Backend
npm install
npm run dev   # nodemon with hot reload
npm start     # production (no hot reload)
```

API runs at `http://localhost:3000`.

## Environment Setup

```bash
cp Backend/.env.example Backend/.env
# Fill in: PORT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is an admin key — it bypasses row-level security and must never be exposed to clients.

### Local Supabase

Local testing uses the Supabase CLI stack (`supabase start` at the repo root; config in `supabase/config.toml`). `Backend/.env` points at it via `http://host.docker.internal:54321`; production credentials live in `Backend/.env.producao` (gitignored), selectable with `ENV_FILE=.env.producao docker-compose up`.

- `cd Backend && npm run db:reset` — `supabase db reset` (applies `supabase/migrations/`) + `scripts/seed-local.js` (test users with password `senha123`, ~3 months of plantões, trocas, afastamentos, casos fora, fichas). The seed refuses to run against a non-local URL.
- Schema changes: add a new file to `supabase/migrations/` **and** run the same SQL manually in the production SQL Editor (production has no migration tooling).
- `20261015000000_schema_inicial.sql` is a `supabase db dump` of production (public schema only). Triggers on `auth.users` aren't in such dumps, so `on_auth_user_created` is recreated in its own migration.

## Architecture

### Request Flow

```
Request → app.js
  → /auth/* → routes/auth.js → authController.js  (public, no auth)
  → authMiddleware (validates JWT via Supabase)
  → /users/* → routes/users.js → users.js          (protected)
```

The placement of `app.use(authMiddleware)` in `app.js` is what separates public from protected routes — all routes registered **before** it are public, all **after** are protected.

### Auth Middleware (`src/middleware/auth.js`)

Validates Bearer tokens by calling `supabase.auth.getUser(token)` using the service role key. On success, attaches the Supabase user object to `req.user`.

### Roles System

Roles are stored in `app_metadata` on the Supabase user (not `user_metadata`). Valid roles: `anestesita_socio`, `anestesita_plantonista`, `tecnico`, `coordenador`, `admin`. Only the service role key can set/modify roles — user JWTs cannot.

### Supabase Client Pattern

Each file that needs Supabase instantiates its own client inline:
```js
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
```

Note: `Backend/supabase.js` at the root uses ESM syntax (`import`/`export`) and is not imported anywhere — all active code in `src/` uses CommonJS (`require`/`module.exports`).

### Unused File

`src/routes/index.js` is not imported in `app.js` — `app.js` imports route files directly. It also requires controllers that don't exist (`healthController`, `hello`, `hospital`), so it would crash if mounted.

## API Endpoints

**Public:**
- `GET /health` — `{ status, banco }`; does a light `profiles` query (503 if the DB fails). Meant for an external uptime monitor that keeps Render's free instance awake
- `POST /auth/login` — returns `{ token }` (Supabase JWT)
- `POST /auth/register` — creates user via `supabase.auth.admin.createUser`, email confirmation is bypassed

**Protected** (`Authorization: Bearer <token>` required):
- `GET /auth/me` — returns `{ id, email, roles }` for the authenticated user. Exception to the public/protected split below: mounted under `/auth` (before the global `authMiddleware`), so it applies `authMiddleware` directly on the route in `routes/auth.js`.
- `GET /users` — list users
