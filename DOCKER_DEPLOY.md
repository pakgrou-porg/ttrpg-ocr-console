# TTRPG OCR Console — Docker & Portainer Deployment Guide

This guide covers three deployment paths: a one-command CLI deploy using `deploy.sh`, a Portainer stack using the pre-built image from GitHub Container Registry (GHCR), and a manual `docker compose` workflow for development.

The console bundles **MySQL 8** as a companion container — no external database is required for local testing. The MySQL data is persisted in a named Docker volume (`ocr_db_data`) so it survives container restarts and image updates.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Docker Engine | 24.x | [Install Docker](https://docs.docker.com/engine/install/) |
| Docker Compose | v2.x | Bundled with Docker Desktop; or `apt install docker-compose-plugin` |
| Portainer CE | 2.x | Optional — for GUI management |
| Git | any | For cloning the repo |
| Available RAM | 1 GB | ~512 MB for the app + ~512 MB for MySQL |
| Available Disk | 4 GB | Image layers + MySQL data volume |

---

## How the CI/CD Pipeline Works

Every push to the `main` branch triggers `.github/workflows/release.yml`, which:

1. Builds a multi-platform Docker image (`linux/amd64` + `linux/arm64`) using the `Dockerfile` in the repo root.
2. Pushes the image to GitHub Container Registry (GHCR) with three tags:
   - `ghcr.io/pakgrou-porg/ttrpg-ocr-console:latest` — always points to the most recent `main` build.
   - `ghcr.io/pakgrou-porg/ttrpg-ocr-console:<sha>` — the 7-character git commit SHA for pinning.
   - `ghcr.io/pakgrou-porg/ttrpg-ocr-console:v1.2.3` — set when a version tag (`v*.*.*`) is pushed.

This means Portainer can pull a pre-built image without needing the source code or Node.js on the host machine.

### One-time GitHub Actions setup

The workflow uses `GITHUB_TOKEN` (automatically injected by GitHub Actions) to push to GHCR. The only manual step required is granting write access to packages:

1. In the GitHub repository, go to **Settings → Actions → General**.
2. Under "Workflow permissions", select **Read and write permissions**.
3. Click **Save**.

---

## Authenticating Portainer with GHCR (Private Repository)

Because the GitHub repository is private, Portainer must authenticate with GHCR before it can pull the image. This is a one-time setup.

### Step 1 — Create a GitHub Personal Access Token (PAT)

1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens) and click **Generate new token (classic)**.
2. Give it a descriptive name such as `portainer-ghcr-pull`.
3. Set the expiration to **No expiration** (or a long period — you will need to rotate it when it expires).
4. Under **Select scopes**, tick only **`read:packages`**. No other scopes are needed.
5. Click **Generate token** and copy the value immediately — GitHub will not show it again.

### Step 2 — Add the Registry to Portainer

1. In Portainer, navigate to **Settings → Registries → Add registry**.
2. Select **GitHub Container Registry** as the registry type.
3. Fill in the form:

| Field | Value |
|---|---|
| Username | Your GitHub username (e.g. `pakgrou-porg`) |
| Personal Access Token | The PAT you just created |

4. Click **Add registry**.

Portainer will now automatically use this credential whenever it pulls any `ghcr.io/pakgrou-porg/...` image.

### Step 3 — Verify the Credential

In Portainer, navigate to **Settings → Registries**, find the entry you just created, and click **Test** (the icon on the right). A green tick confirms authentication is working.

---

## Option A — Portainer Stack (Recommended for Local Testing)

This is the cleanest path for Portainer users. No source code or Node.js required on the host.

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

Open `http://localhost:9000` and complete the setup wizard.

### Step 2 — Deploy the Stack

1. In Portainer, navigate to **Stacks → Add Stack**.
2. Give the stack a name: `ttrpg-ocr-console`.
3. Select the **Upload** tab and upload `portainer-stack.yml` from the repository.
   - Alternatively, use the **Repository** tab with URL `https://github.com/pakgrou-porg/ttrpg-ocr-console` and compose path `portainer-stack.yml`.
4. Scroll to the **Environment variables** panel and add the variables from the table below.
5. Click **Deploy the stack**.

### Step 3 — Run Database Migrations (First Deployment Only)

After the first deployment, run the Drizzle migrations once to create all tables:

```bash
docker exec -it ttrpg-ocr-console-console-1 \
  sh -c "npm install -g pnpm@10 --silent && pnpm db:push"
```

Or in Portainer: **Containers → ttrpg-ocr-console-console-1 → Console → Connect**, then run the command above.

Subsequent deployments do **not** require this step unless the schema has changed (check the release notes).

### Updating to a New Version

1. In Portainer, navigate to **Stacks → ttrpg-ocr-console**.
2. Click **Pull and redeploy**.

Portainer pulls the new `:latest` image from GHCR and restarts the container. The MySQL volume is untouched.

---

## Option B — CLI Deploy with `deploy.sh`

`deploy.sh` is a single script that handles the full lifecycle: env validation, git pull, MySQL health wait, migrations, and container rebuild.

```bash
# 1. Clone the repository
git clone https://github.com/pakgrou-porg/ttrpg-ocr-console.git
cd ttrpg-ocr-console

# 2. Create your environment file
cp env.example .env
# Edit .env and fill in the required values (see Environment Variables below)

# 3. Deploy
./deploy.sh
```

The script will:
- Validate that all required env vars are set.
- Pull the latest code from Git.
- Start the MySQL container and wait for it to pass its health check.
- Run `pnpm db:push` to apply any pending migrations.
- Build the console image from source and start it.

**Available flags:**

| Flag | Effect |
|---|---|
| `--env FILE` | Use a custom `.env` file path (default: `.env` in the repo root) |
| `--skip-pull` | Skip `git pull` (use local code as-is) |
| `--skip-migrate` | Skip `pnpm db:push` |
| `--down` | Stop and remove containers (preserves the DB volume) |
| `--reset-db` | Stop containers and **delete** the DB volume (destructive — prompts for confirmation) |

---

## Option C — Manual `docker compose` (Development)

```bash
git clone https://github.com/pakgrou-porg/ttrpg-ocr-console.git
cd ttrpg-ocr-console
cp env.example .env
# Fill in .env

# Start MySQL first
docker compose up -d db

# Wait ~15 s for MySQL to be ready, then run migrations
docker compose run --rm console sh -c "npm install -g pnpm@10 --silent && pnpm db:push"

# Start the full stack (builds the console image from source)
docker compose up -d

# Open the console
open http://localhost:3000
```

To use the pre-built GHCR image instead of building from source, edit `docker-compose.yml`: comment out the `build:` block and uncomment the `image:` line.

---

## Environment Variables

Copy `env.example` to `.env` and fill in the values below. For Portainer, enter these in the **Environment variables** panel when creating or editing the stack.

### Required

| Variable | Description |
|---|---|
| `MYSQL_ROOT_PASSWORD` | Root password for the bundled MySQL container. Use a strong random value. |
| `MYSQL_PASSWORD` | Password for the `ocr_user` application account. |
| `JWT_SECRET` | Signs session cookies. Generate with `openssl rand -base64 32`. |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting stored provider API keys and DB passwords. Generate separately from `JWT_SECRET` with `openssl rand -base64 32`. |
| `VITE_APP_ID` | Manus OAuth application ID. Found in your Manus project → Settings → OAuth. |
| `OWNER_OPEN_ID` | Your Manus user Open ID. Grants you the admin role on first login. |
| `OWNER_NAME` | Your display name (shown in the top-right of the console). |

### Optional (with defaults)

| Variable | Default | Description |
|---|---|---|
| `MYSQL_DATABASE` | `ttrpg_ocr` | Database name to create inside MySQL. |
| `MYSQL_USER` | `ocr_user` | Application database username. |
| `HOST_PORT` | `3000` | Host port that maps to the container's port 3000. |
| `IMAGE_TAG` | `latest` | GHCR image tag to pull (Portainer stack only). Pin to a SHA for stability. |
| `OAUTH_SERVER_URL` | `https://api.manus.im` | Manus OAuth backend base URL. |
| `VITE_OAUTH_PORTAL_URL` | `https://manus.im` | Manus login portal URL shown to users. |
| `CREDENTIAL_ENCRYPTION_KEY` | _(falls back to `JWT_SECRET`)_ | Separate encryption key for stored credentials. |
| `VITE_APP_TITLE` | `TTRPG OCR Console` | Browser tab title. |
| `VITE_APP_LOGO` | _(blank)_ | URL to a custom logo image. |
| `BUILT_IN_FORGE_API_URL` | _(blank)_ | Manus built-in AI API base URL (server-side). |
| `BUILT_IN_FORGE_API_KEY` | _(blank)_ | Manus built-in AI API key (server-side). |
| `VITE_FRONTEND_FORGE_API_URL` | _(blank)_ | Manus AI API URL for the browser. |
| `VITE_FRONTEND_FORGE_API_KEY` | _(blank)_ | Manus AI API key for the browser. |
| `VITE_ANALYTICS_ENDPOINT` | _(blank)_ | Umami / Plausible analytics endpoint. |
| `VITE_ANALYTICS_WEBSITE_ID` | _(blank)_ | Analytics website ID. |

### Generating Secrets

```bash
# JWT_SECRET
openssl rand -base64 32

# CREDENTIAL_ENCRYPTION_KEY (must be a different value)
openssl rand -base64 32
```

---

## Rollback Procedure

### Via Portainer

1. Navigate to **Stacks → ttrpg-ocr-console → Editor**.
2. Change the image tag from `:latest` to a specific SHA (visible in the GitHub Actions run summary, e.g., `a1b2c3d`).
3. Click **Update the stack**.

### Via CLI

```bash
# List available local images with their creation dates
docker images ghcr.io/pakgrou-porg/ttrpg-ocr-console

# Pin to a specific SHA in portainer-stack.yml or docker-compose.yml:
#   image: ghcr.io/pakgrou-porg/ttrpg-ocr-console:a1b2c3d
docker compose up -d console
```

If a schema migration was also applied and needs reverting, restore the MySQL volume from a backup (see below) before rolling back the image.

---

## Backup & Restore

### Backup the database volume

```bash
docker run --rm \
  -v ttrpg-ocr-console_ocr_db_data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/db_backup_$(date +%Y%m%d_%H%M%S).tar.gz /data
```

### Restore

```bash
docker compose stop db
docker run --rm \
  -v ttrpg-ocr-console_ocr_db_data:/data \
  -v "$(pwd)":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/db_backup_YYYYMMDD_HHMMSS.tar.gz -C /"
docker compose start db
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Container exits immediately | Missing `JWT_SECRET` | Check `docker logs ttrpg-ocr-console-console-1` for `[ENV] Required environment variable` |
| Login redirects in a loop | Wrong `VITE_APP_ID` or `OAUTH_SERVER_URL` | Verify values match your Manus project settings |
| `ER_ACCESS_DENIED_ERROR` | Credential mismatch | Confirm `MYSQL_USER`/`MYSQL_PASSWORD` match the values used when the volume was first created |
| `Table 'X' doesn't exist` | Migration not run | Run `pnpm db:push` inside the container (see Step 3 above) |
| Port 3000 already in use | Another service on that port | Set `HOST_PORT=3001` (or any free port) in `.env` |
| GHCR pull fails (403) | Private repo / missing credentials | Add a GitHub PAT with `packages:read` scope as a Portainer registry credential |
| `pnpm: not found` in container | Image built without pnpm | Rebuild with `docker compose build --no-cache console` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Host                                                    │
│                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────┐   │
│  │  console                 │   │  db                      │   │
│  │  ghcr.io/…:latest        │──▶│  mysql:8.0               │   │
│  │  Node 22 / Express       │   │  port 3306 (internal)    │   │
│  │  React 19 / Vite         │   │  volume: ocr_db_data     │   │
│  │  port 3000 → HOST_PORT   │   └──────────────────────────┘   │
│  └──────────────────────────┘                                   │
│                                                                 │
│  Network: ocr_net (bridge)                                      │
└─────────────────────────────────────────────────────────────────┘

GitHub Actions (on push to main):
  source code → Dockerfile → ghcr.io/pakgrou-porg/ttrpg-ocr-console:latest
                                        ↑
                              Portainer pulls this image
```

The `console` container serves both the compiled React frontend (`client/dist/`) and the Express API (`/api/trpc`, `/api/oauth`) on the same port, so no reverse proxy is needed for local testing.
