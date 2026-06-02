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

`src/routes/index.js` is not imported in `app.js` — `app.js` imports route files directly.

## API Endpoints

**Public:**
- `GET /health` — health check
- `POST /auth/login` — returns `{ token }` (Supabase JWT)
- `POST /auth/register` — creates user via `supabase.auth.admin.createUser`, email confirmation is bypassed

**Protected** (`Authorization: Bearer <token>` required):
- `GET /users` — list users
