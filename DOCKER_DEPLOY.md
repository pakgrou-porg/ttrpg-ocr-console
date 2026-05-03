# TTRPG OCR Console — Docker & Portainer Deployment Guide

This guide covers how to run the TTRPG OCR Console in a Docker container locally using Portainer, pulling the latest code from GitHub and configuring it entirely through environment variables.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Docker Engine | 24.x | [Install Docker](https://docs.docker.com/engine/install/) |
| Docker Compose | v2.x | Bundled with Docker Desktop; or `apt install docker-compose-plugin` |
| Portainer CE | 2.x | Optional but recommended for GUI management |
| Git | any | Only needed for manual clone workflows |
| Available RAM | 1 GB | 512 MB for the app + 512 MB for MySQL |
| Available Disk | 4 GB | Source build cache + MySQL data volume |

---

## Quick Start (CLI)

```bash
# 1. Clone the repository
git clone https://github.com/pakgrou-porg/ttrpg-ocr-console.git
cd ttrpg-ocr-console

# 2. Create your environment file (see "Environment Variables" section below)
cp env-template.txt .env
nano .env   # fill in JWT_SECRET and other required values

# 3. Run the schema migration (first run only, or after schema changes)
#    This requires the db container to be running first
docker compose up -d db
sleep 15   # wait for MySQL to be ready
docker compose run --rm console pnpm db:push

# 4. Start the full stack
docker compose up -d

# 5. Open the console
open http://localhost:3000
```

---

## Portainer Stack Deployment

Portainer's **Stacks** feature lets you deploy and update the console directly from the GitHub repository without touching the command line.

### Step 1 — Install Portainer (if not already running)

```bash
docker volume create portainer_data

docker run -d \
  --name portainer \
  --restart=always \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Open `http://localhost:9000` and complete the initial setup wizard.

### Step 2 — Create the Stack

1. In Portainer, navigate to **Stacks → Add Stack**.
2. Give the stack a name, e.g., `ttrpg-ocr-console`.
3. Select the **Repository** tab.
4. Fill in the fields:

| Field | Value |
|---|---|
| Repository URL | `https://github.com/pakgrou-porg/ttrpg-ocr-console` |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.yml` |
| Authentication | Leave unchecked (public repo) |

5. Scroll down to the **Environment variables** section and add each variable from the table in the next section.
6. Click **Deploy the stack**.

### Step 3 — Run the Database Migration

After the first deployment (or after any schema change), run the migration once:

```bash
docker exec -it ttrpg-ocr-console-console-1 pnpm db:push
```

Or in Portainer: **Containers → ttrpg-ocr-console-console-1 → Console → Connect** and run `pnpm db:push`.

---

## Environment Variables

Copy the block below into Portainer's **Environment variables** editor or into a `.env` file for CLI use.

### Required

| Variable | Description | Example |
|---|---|---|
| `JWT_SECRET` | Signs session cookies. Generate with `openssl rand -base64 32`. | `abc123...` |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting provider API keys and DB passwords. Generate separately from `JWT_SECRET`. | `xyz789...` |
| `MYSQL_ROOT_PASSWORD` | Root password for the bundled MySQL container. | `changeme_root` |
| `MYSQL_DATABASE` | Database name to create. | `ttrpg_ocr` |
| `MYSQL_USER` | Application database user. | `ocr_user` |
| `MYSQL_PASSWORD` | Application database user password. | `changeme_user` |

### Manus OAuth (Required for Login)

The console uses Manus OAuth for authentication. These values are available in your Manus project settings.

| Variable | Description | Where to find |
|---|---|---|
| `VITE_APP_ID` | Manus OAuth application ID | Manus project → Settings → OAuth |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL | Default: `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL | Default: `https://manus.im` |
| `OWNER_OPEN_ID` | Your Manus user Open ID | Manus project → Settings |
| `OWNER_NAME` | Your display name | Manus project → Settings |

### Optional

| Variable | Description | Default |
|---|---|---|
| `HOST_PORT` | Host port that maps to the container's port 3000 | `3000` |
| `BUILT_IN_FORGE_API_URL` | Manus built-in AI API base URL | _(blank)_ |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in AI API key (server-side) | _(blank)_ |
| `VITE_FRONTEND_FORGE_API_URL` | Manus AI API URL for the browser | _(blank)_ |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus AI API key for the browser | _(blank)_ |
| `VITE_APP_TITLE` | Browser tab title | `TTRPG OCR Console` |
| `VITE_APP_LOGO` | URL to a custom logo image | _(blank)_ |
| `VITE_ANALYTICS_ENDPOINT` | Umami / Plausible analytics endpoint | _(blank)_ |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics website ID | _(blank)_ |

### Generating Secrets

```bash
# JWT_SECRET
openssl rand -base64 32

# CREDENTIAL_ENCRYPTION_KEY (use a different value from JWT_SECRET)
openssl rand -base64 32
```

---

## Updating to the Latest Version

### Via Portainer

1. Navigate to **Stacks → ttrpg-ocr-console**.
2. Click **Pull and redeploy**.
3. Portainer pulls the latest `main` branch, rebuilds the image, and restarts the container.

### Via CLI

```bash
cd ttrpg-ocr-console
git pull origin main
docker compose build --no-cache console
docker compose up -d console
# Run migration if schema changed
docker exec -it ttrpg-ocr-console-console-1 pnpm db:push
```

---

## Using an External Database

If you already have a MySQL 8 / TiDB / PlanetScale instance, skip the bundled `db` service and set `DATABASE_URL` directly.

In `docker-compose.yml`, comment out the `db:` service and the `depends_on` block, then add:

```yaml
environment:
  DATABASE_URL: mysql://USER:PASSWORD@your-db-host:3306/ttrpg_ocr
```

Or in Portainer's environment variables:

```
DATABASE_URL=mysql://USER:PASSWORD@your-db-host:3306/ttrpg_ocr
```

---

## Rollback Procedure

If a new deployment breaks the console:

```bash
# 1. Find the previous image ID
docker images ghcr.io/pakgrou-porg/ttrpg-ocr-console --format "{{.ID}} {{.CreatedAt}}"

# 2. Roll back to the previous image
docker compose stop console
docker tag <previous-image-id> ttrpg-ocr-console-console:rollback
docker compose up -d console

# 3. If the schema migration was also run and needs reverting,
#    restore the MySQL volume from a backup (see Backup section below).
```

In Portainer: **Stacks → ttrpg-ocr-console → Editor** → revert the Git ref to the previous commit SHA → **Update the stack**.

---

## Backup & Restore

### Backup the database volume

```bash
docker run --rm \
  -v ttrpg-ocr-console_db_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/db_backup_$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
docker compose stop db
docker run --rm \
  -v ttrpg-ocr-console_db_data:/data \
  -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/db_backup_YYYYMMDD.tar.gz -C /"
docker compose start db
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Container exits immediately | Missing `JWT_SECRET` | Check `docker logs ttrpg-ocr-console-console-1` for `[ENV] Required environment variable` |
| Login redirects in a loop | Wrong `VITE_APP_ID` or `OAUTH_SERVER_URL` | Verify values match your Manus project settings |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DATABASE_URL` credentials | Check `MYSQL_USER` / `MYSQL_PASSWORD` match `DATABASE_URL` |
| `Table 'X' doesn't exist` | Migration not run | Run `docker exec -it ... pnpm db:push` |
| Port 3000 already in use | Another service on that port | Change `HOST_PORT` to e.g. `3001` |
| Build fails on `pnpm install` | Stale lock file | Run `docker compose build --no-cache` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Docker Host                                            │
│                                                         │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │  console             │   │  db                    │  │
│  │  Node 22 / Express   │──▶│  MySQL 8               │  │
│  │  React 19 / Vite     │   │  port 3306 (internal)  │  │
│  │  port 3000 → HOST    │   │  volume: db_data       │  │
│  └──────────────────────┘   └────────────────────────┘  │
│                                                         │
│  Network: ocr_net (bridge)                              │
└─────────────────────────────────────────────────────────┘
```

The `console` container serves both the compiled React frontend (from `client/dist/`) and the Express API (`/api/trpc`, `/api/oauth`) on the same port, so no reverse proxy is needed for local testing.
