#!/usr/bin/env bash
# Creates/updates Google Cloud Scheduler HTTP jobs for all cron endpoints.
#
# Prerequisites:
#   1. Deploy Cloud Run cron API: npm run deploy:cron
#   2. gcloud auth login && gcloud config set project rapids-platform
#   3. Artifact Registry repo `account-mgmt` in us-central1 (created by bootstrap script)
#
# Optional: store secrets in Secret Manager and mount on Cloud Run separately.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-rapids-platform}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-account-mgmt-cron}"
SCHEDULER_SA="${SCHEDULER_SA:-account-mgmt-cron-invoker@${PROJECT_ID}.iam.gserviceaccount.com}"
LOCATION="${LOCATION:-us-central1}"

echo "Resolving Cloud Run URL for ${SERVICE_NAME}..."
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

if [[ -z "${SERVICE_URL}" ]]; then
  echo "Could not resolve Cloud Run URL. Deploy the service first."
  exit 1
fi

echo "Cloud Run URL: ${SERVICE_URL}"

echo "Ensuring scheduler service account exists: ${SCHEDULER_SA}"
if ! gcloud iam service-accounts describe "${SCHEDULER_SA}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  if ! gcloud iam service-accounts create account-mgmt-cron-invoker \
    --project="${PROJECT_ID}" \
    --display-name="Account Mgmt Cron Invoker" 2>/dev/null; then
    echo "❌ Cannot create service account. Ask admin to run:"
    echo "   DEVELOPER_EMAIL=aviral@risalabs.ai bash scripts/iam-grants-for-admin.sh"
    exit 1
  fi
fi

echo "Granting Cloud Run invoker to scheduler SA..."
if ! gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" \
  --quiet 2>/dev/null; then
  echo "⚠ Could not set run.invoker — admin must run scripts/iam-grants-for-admin.sh"
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
echo "Granting Firestore access to Cloud Run runtime SA: ${RUNTIME_SA}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/datastore.user" \
  --quiet >/dev/null 2>&1 || true

declare -a JOBS=(
  "metrics-sync-12am|0 0 * * *|Daily metrics sync (previous day)"
  "metrics-sync-5am|0 5 * * *|Daily metrics sync (previous day)"
  "metrics-sync-10am|0 10 * * *|Daily metrics sync (current day)"
  "metrics-sync-12pm|0 12 * * *|Daily metrics sync (current day)"
  "metrics-sync-2pm|0 14 * * *|Daily metrics sync (current day)"
  "metrics-sync-4pm|0 16 * * *|Daily metrics sync (current day)"
  "metrics-sync-6pm|0 18 * * *|Daily metrics sync (current day)"
  "metrics-sync-8pm|0 20 * * *|Daily metrics sync (current day)"
  "metrics-sync-10pm|0 22 * * *|Daily metrics sync (current day)"
  "queue-sync|5 0 * * *|Queue daily log snapshot"
  "open-orders-refresh|0 5 * * 1-5|Open orders re-sync (Mon-Fri)"
  "retention-cleanup|0 3 * * *|Sheet retention cleanup"
  "medonc-daily-alerts|0 9 * * 1-5|MedOnc daily alerts (Mon-Fri)"
  "open-orders-summary|0 9 * * 1-5|Open orders summary (Mon-Fri)"
  "dos-coverage-org|0 9 * * 1-5|DoS coverage org alerts (Mon-Fri)"
  "capacity-check|0 9 * * *|Sheet capacity monitoring"
  "astera-yesterday-unworked|30 15 * * *|Astera yesterday assigned unworked"
  "astera-denial-internal|0 16 * * *|Astera denial list (internal)"
  "astera-dashboard-sync|30 16 * * *|Astera dashboard Sheets sync"
  "astera-assigned-unworked|0 17 * * *|Astera assigned unworked 2+ days"
  "astera-query-return|15 17 * * *|Astera query return re-allotment"
  "slack-alerts|0 22 * * *|Daily Slack performance alerts"
  "astera-wip-stale|0 22 * * *|Astera WIP > 1 day"
  "astera-authmate-pending|0 23 * * *|Astera AuthMate-Pending missed notes"
)

for entry in "${JOBS[@]}"; do
  IFS='|' read -r JOB_ID SCHEDULE DESCRIPTION <<< "${entry}"
  JOB_NAME="amd-cron-${JOB_ID}"

  echo "→ ${JOB_NAME} (${SCHEDULE} IST)"

  if gcloud scheduler jobs describe "${JOB_NAME}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${JOB_NAME}" \
      --project="${PROJECT_ID}" \
      --location="${LOCATION}" \
      --schedule="${SCHEDULE}" \
      --time-zone="Asia/Kolkata" \
      --uri="${SERVICE_URL}/cron/${JOB_ID}" \
      --http-method=POST \
      --oidc-service-account-email="${SCHEDULER_SA}" \
      --oidc-token-audience="${SERVICE_URL}" \
      --description="${DESCRIPTION}" \
      --attempt-deadline=900s \
      --quiet
  else
    gcloud scheduler jobs create http "${JOB_NAME}" \
      --project="${PROJECT_ID}" \
      --location="${LOCATION}" \
      --schedule="${SCHEDULE}" \
      --time-zone="Asia/Kolkata" \
      --uri="${SERVICE_URL}/cron/${JOB_ID}" \
      --http-method=POST \
      --oidc-service-account-email="${SCHEDULER_SA}" \
      --oidc-token-audience="${SERVICE_URL}" \
      --description="${DESCRIPTION}" \
      --attempt-deadline=900s \
      --quiet
  fi
done

echo ""
echo "✅ Cloud Scheduler jobs configured (${#JOBS[@]} jobs)"
echo "   Service: ${SERVICE_URL}"
echo ""
echo "Next: copy .env secrets to Cloud Run (Console → account-mgmt-cron → Edit → Variables & Secrets)"
