# RailGaadi — Deploy to AWS EC2 (Production)

## Quick live in 2 minutes (free, no server, no card)

Run the app on this PC (Docker Compose on port 80) and expose it with a free
Cloudflare Tunnel — you get a public HTTPS URL instantly:

```powershell
# start the tunnel (opens the URL in your browser)
powershell -ExecutionPolicy Bypass -File deploy\tunnel.ps1

# check URL / stop it
powershell -ExecutionPolicy Bypass -File deploy\tunnel.ps1 -Status
powershell -ExecutionPolicy Bypass -File deploy\tunnel.ps1 -Stop
```

Caveats: the URL changes whenever the tunnel restarts (PC reboot); the PC must
stay on; works great for demos. For a stable URL, use a named tunnel (free,
needs a domain on Cloudflare) or the EC2 deployment below.

---

## Branch workflow (dev → staging → production)

Three long-lived branches, protected on GitHub:

| Branch | Role | Env file |
|---|---|---|
| `dev` | **Development** — daily coding, rough work | `.env.local` (local dev) |
| `staging` | **Staging** — test everything here before release | `.env.staging` → uploaded as `.env` |
| `main` | **Production** — only merged after staging passes | `.env.production` → uploaded as `.env` |

Development flow:

```bash
git checkout dev               # coding happens here (or a feature branch → merge to dev)
# ... code + tests ...
git push origin dev
git checkout staging           # promote to staging for testing
git merge dev
git push origin staging        # deploy staging server:
#   git clone -b staging ... && ./deploy/setup.sh   (uses .env.staging as .env)
#   ... test the staging URL ...
git checkout main              # staging passed → promote to production
git merge staging
git push origin main           # deploy production server (./deploy/deploy.sh)
```

Generating the two env files (from your local `backend/.env` + `frontend/.env.local`):

```powershell
powershell -File deploy\generate-prod-env.ps1           # deploy/.env.production
powershell -File deploy\generate-prod-env.ps1 -Staging  # deploy/.env.staging
```

Both are gitignored (never committed). Each server keeps its own `.env`.
Use **separate MongoDB databases** for staging vs production (e.g. `railgaadi_staging`
vs `railgaadi`) so staging tests never touch real data.

---

## EC2 production deployment

Real production deployment on a single EC2 instance:

```
                 Internet
                    │ :80
            ┌───────▼────────┐
            │  nginx (proxy) │  deploy/nginx/nginx.conf
            └───┬────────┬───┘
      /api/v1/* │        │ everything else
            ┌───▼──┐  ┌──▼─────┐
            │backend│  │frontend│  (Docker Compose network `railgaadi`)
            │ :4000 │  │ :3000  │
            └───┬───┘  └──┬─────┘
                │         │
        MongoDB Atlas · Upstash Redis · RailRadar API (all remote, reused)
```

Nothing is stored on the instance — MongoDB stays on Atlas, cache on Upstash.
The instance only runs 3 containers: **backend**, **frontend (Next.js)**, **nginx**.

---

## 0. Prerequisites

- AWS account (free tier works).
- Your GitHub repo with the code pushed:
  `https://github.com/rakeshkumartripathy629/Live-train-tracker`
- This PC, where the real secrets live (`backend/.env`, `frontend/.env.local`).

---

## 1. Launch the EC2 instance

AWS Console → **EC2 → Launch instance**:

| Setting | Value |
|---|---|
| Name | `railgaadi-prod` |
| AMI | **Ubuntu Server 24.04 LTS** (HVM, x86_64) |
| Instance type | `t3.small` (2 GB RAM). `t3.micro` may OOM while building Next.js. |
| Key pair | **Create new** `railgaadi-key` → download the `.pem` to this PC |
| Network settings | **Create security group** (see below) |
| Storage | 20 GB gp3 (default) |

Security group rules:

| Type | Port | Source |
|---|---|---|
| SSH | 22 | `My IP` (or `0.0.0.0/0` if your IP changes) |
| HTTP | 80 | `0.0.0.0/0` |

## 2. Allocate an Elastic IP (recommended)

EC2 → **Elastic IPs → Allocate** → Associate with the instance.
This keeps your URL stable across stop/start (free while the instance is running).

## 3. Allow EC2 in MongoDB Atlas

Atlas → **Network Access → Add IP** → add the EC2 **public IP** (or `0.0.0.0/0`
for simplicity). The app uses the same cluster as local dev.

## 4. SSH into the server

From **this PC** (PowerShell):

```powershell
chmod 400 railgaadi-key.pem          # (Git Bash) — skip on Windows PowerShell
ssh -i railgaadi-key.pem ubuntu@<PUBLIC_IP>
```

## 5. Get the code + upload secrets

On the server (if the repo is public):

```bash
git clone https://github.com/rakeshkumartripathy629/Live-train-tracker.git
cd Live-train-tracker
```

If it asks for credentials (private repo), use a PAT or SSH key, e.g.:

```bash
gh auth login && gh repo clone rakeshkumartripathy629/Live-train-tracker
```

Then upload the env file generated on **this PC**:

```powershell
scp -i railgaadi-key.pem C:\...\deploy\.env.production ubuntu@<PUBLIC_IP>:~/
```

And on the server move it into place:

```bash
mv ~/.env.production ~/Live-train-tracker/.env
```

## 6. Fill the one remaining value

Edit `.env` and set `PUBLIC_IP=<your EC2 public IP>`
(setup.sh auto-writes `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS` from it,
and generates `NEXTAUTH_SECRET` + `INTERNAL_API_TOKEN` if left blank):

```bash
nano .env      # set PUBLIC_IP=<EC2 IP>
```

If you used the template instead of the generated file, also fill the secret
values (MONGODB_URI, RAILRADAR_API_KEY, VAPID_*, OPENWEATHER_API_KEY,
OPENTOPOGRAPHY_API_KEY, NEXT_PUBLIC_MAPTILER_API_KEY — all in your local env files).

## 7. Setup + first deploy

```bash
cd ~/Live-train-tracker
chmod +x deploy/setup.sh deploy/deploy.sh
./deploy/setup.sh
```

`setup.sh` installs Docker + Compose, validates `.env`, then builds and starts
all three containers. First build takes a few minutes.

## 8. Verify

```bash
docker compose -f deploy/docker-compose.prod.yml ps        # 3 containers Up/healthy
curl -I http://<PUBLIC_IP>/                                 # frontend → 200
curl  http://<PUBLIC_IP>/api/v1/stations/BAM                # backend via nginx → JSON
curl  http://<PUBLIC_IP>/api/v1/push-key                    # backend → publicKey JSON
```

Then open `http://<PUBLIC_IP>/` in a browser.

## 9. Deploy updates (every new push)

```bash
./deploy/deploy.sh     # git pull --ff-only + rebuild + restart
```

Or from Windows, SSH in and run it. Builds are cached — updates are fast.

---

## Ops notes

- **Logs**: `docker compose -f deploy/docker-compose.prod.yml logs -f`
- **Restart everything**: `docker compose -f deploy/docker-compose.prod.yml restart`
- **Stop**: `docker compose -f deploy/docker-compose.prod.yml down`
- **Auto-restart on reboot**: `restart: unless-stopped` is set for all containers.
- **Docker group**: after `setup.sh` installs Docker you may need to
  `newgrp docker` or re-login if `sudo docker` is required; scripts handle both.
- **RailRadar quota**: the free tier is ~50 requests/day — production traffic will
  exhaust it quickly. Watch quota in logs; consider a paid plan when live.
- **Backups**: Atlas (point-in-time) covers your database. Nothing local to back up.

## HTTPS upgrade (later, when you have a domain)

1. Buy a domain, add an **A record** → the Elastic IP.
2. Set `PUBLIC_IP=yourdomain.com` in `.env`, re-run `./deploy/setup.sh`.
3. Then add TLS with certbot or Caddy; update `deploy/nginx/nginx.conf` for port 443.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` | A container unhealthy — `docker compose ... ps` / `logs` |
| Build kills the instance (OOM) | Stop it, change instance type to `t3.small`/`t3.medium`, restart setup |
| `No such file: .env` | Run `./deploy/setup.sh` from the repo root; ensure `.env` exists |
| NextAuth "URL not allowed" | `NEXTAUTH_URL` must exactly match `http://<PUBLIC_IP>` |
| Backend 401 / quota errors | RailRadar free quota exhausted (see Ops notes) |
| Mongo connection refused | Atlas Network Access must include the EC2 public IP (step 3) |
| `/bin/bash^M` bad interpreter | CRLF line endings — run `sed -i 's/\r$//' deploy/setup.sh deploy/deploy.sh` |
| Port 80 unreachable | Security group must allow HTTP from 0.0.0.0/0 (step 1) |
