# ══════════════════════════════════════════════════════════════════════════════
#  Futures AI Trend Bot — Google Cloud Deployment Guide
# ══════════════════════════════════════════════════════════════════════════════
#
#  Architecture:
#    Frontend  → Vercel (or Firebase Hosting)
#    Backend   → Cloud Run (Dockerized FastAPI, always-on)
#    Scheduler → Cloud Scheduler (optional health-ping keepalive)
#    Cache     → Cloud Memorystore Redis (optional)
#
# ══════════════════════════════════════════════════════════════════════════════

## ── 0. Prerequisites ──────────────────────────────────────────────────────────

```bash
# Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com \
                        cloudbuild.googleapis.com \
                        cloudscheduler.googleapis.com \
                        artifactregistry.googleapis.com
```

## ── 1. Build & Push Backend to Artifact Registry ──────────────────────────────

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1
SERVICE_NAME=futures-bot-api
REPO=futures-bot

# Create Artifact Registry repo
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION

# Configure Docker auth
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build & push
cd backend
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}:latest .
docker push    ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}:latest
```

## ── 2. Deploy Backend to Cloud Run ───────────────────────────────────────────

```bash
gcloud run deploy $SERVICE_NAME \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 3 \
  --timeout 3600 \
  --concurrency 80 \
  --set-env-vars APP_ENV=production,LOG_LEVEL=INFO,SCAN_INTERVAL_SECONDS=60,MAX_CONCURRENT_SYMBOLS=10,MAX_SYMBOLS=80,TOP_N=20

# Note the deployed URL:
BACKEND_URL=$(gcloud run services describe $SERVICE_NAME \
  --region $REGION --format 'value(status.url)')
echo "Backend URL: $BACKEND_URL"
```

> ⚠️  Set `--min-instances 1` to keep the bot's live loop running.
> Cloud Run spins down to 0 by default, which would kill the scan loop.

## ── 3. (Optional) Cloud Scheduler — Keepalive Ping ───────────────────────────

```bash
# Ping /health every 5 minutes to guarantee min-instance stays warm
gcloud scheduler jobs create http futures-bot-keepalive \
  --location $REGION \
  --schedule "*/5 * * * *" \
  --uri "${BACKEND_URL}/health" \
  --http-method GET \
  --attempt-deadline 30s
```

## ── 4. Deploy Frontend to Vercel ─────────────────────────────────────────────

```bash
# Install Vercel CLI
npm i -g vercel

cd frontend

# Create .env.production.local
echo "NEXT_PUBLIC_API_URL=${BACKEND_URL}"        > .env.production.local
# WebSocket: Cloud Run supports HTTP/2 + WebSocket upgrade
echo "NEXT_PUBLIC_WS_URL=${BACKEND_URL/https/wss}" >> .env.production.local

# Deploy
vercel --prod
```

Alternatively, push to GitHub and connect the repo to Vercel. Set environment
variables in the Vercel dashboard under Project → Settings → Environment Variables.

## ── 5. (Alternative) Frontend on Firebase Hosting ────────────────────────────

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose "dist" or "out" as public dir

# Build Next.js as static export (add output: 'export' to next.config.js)
npm run build

firebase deploy --only hosting
```

## ── 6. (Optional) Cloud Memorystore Redis ────────────────────────────────────

```bash
# Create a Redis instance (Serverless, 1 GB)
gcloud redis instances create futures-bot-cache \
  --size=1 \
  --region=$REGION \
  --tier=BASIC

REDIS_HOST=$(gcloud redis instances describe futures-bot-cache \
  --region=$REGION --format 'value(host)')
REDIS_PORT=6379

# Add to Cloud Run env vars:
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --update-env-vars REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}/0 \
  --vpc-connector projects/${PROJECT_ID}/locations/${REGION}/connectors/YOUR_VPC_CONNECTOR
```

## ── 7. CI/CD with Cloud Build ────────────────────────────────────────────────

Create `cloudbuild.yaml` in the project root:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_IMAGE}', './backend']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_IMAGE}']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - run
      - deploy
      - futures-bot-api
      - --image=${_IMAGE}
      - --region=us-central1
      - --platform=managed

substitutions:
  _IMAGE: 'us-central1-docker.pkg.dev/$PROJECT_ID/futures-bot/futures-bot-api:$COMMIT_SHA'

options:
  logging: CLOUD_LOGGING_ONLY
```

```bash
# Connect to GitHub trigger
gcloud builds triggers create github \
  --repo-name=YOUR_REPO \
  --repo-owner=YOUR_ORG \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

## ── 8. Estimated GCP Costs ────────────────────────────────────────────────────

| Service            | Config              | Est. Monthly Cost |
|--------------------|---------------------|-------------------|
| Cloud Run          | 2 vCPU / 2 GB / 1 min-instance | ~$50–80 |
| Artifact Registry  | ~500 MB storage     | < $1              |
| Cloud Scheduler    | 1 job               | Free (3 free jobs)|
| Memorystore Redis  | 1 GB Basic          | ~$16              |
| **Total**          |                     | **~$65–100/mo**   |

> Vercel frontend is free for hobby / small traffic plans.

## ── 9. Monitoring & Logging ──────────────────────────────────────────────────

```bash
# Tail live logs from Cloud Run
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=futures-bot-api" \
  --freshness=1h \
  --format "value(textPayload)" \
  --limit 200

# Or use the GCP Console → Cloud Run → Logs tab
```

Set up a Log-Based Alert in Cloud Monitoring for ERROR severity to get email/PagerDuty notifications.

## ── 10. Quick Sanity Checks After Deploy ─────────────────────────────────────

```bash
# Health check
curl ${BACKEND_URL}/health | jq

# Rankings
curl "${BACKEND_URL}/ranking?top=10" | jq '.[0]'

# Symbol detail (URL-encode the slash)
curl "${BACKEND_URL}/symbol/BTC%2FUSDT%3AUSDT" | jq '.roi_pct,.sharpe,.trade_count'
```
