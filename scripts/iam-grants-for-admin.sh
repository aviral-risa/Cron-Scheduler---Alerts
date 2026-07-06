#!/usr/bin/env bash
# IAM grants for a project admin to run once on rapids-platform.
# Usage (admin account):
#   gcloud config set project rapids-platform
#   bash scripts/iam-grants-for-admin.sh
#
# Optional: grant deploy access to a developer
#   DEVELOPER_EMAIL=aviral@risalabs.ai bash scripts/iam-grants-for-admin.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-rapids-platform}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-account-mgmt-cron}"
DEVELOPER_EMAIL="${DEVELOPER_EMAIL:-}"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
SCHEDULER_SA="account-mgmt-cron-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project: ${PROJECT_ID} (${PROJECT_NUMBER})"

bind_project_role() {
  local member="$1"
  local role="$2"
  echo "  + ${role} → ${member}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${member}" \
    --role="${role}" \
    --quiet >/dev/null
}

echo ""
echo "1) Cloud Build → deploy Cloud Run"
bind_project_role "serviceAccount:${CLOUD_BUILD_SA}" "roles/run.admin"
bind_project_role "serviceAccount:${CLOUD_BUILD_SA}" "roles/iam.serviceAccountUser"
bind_project_role "serviceAccount:${CLOUD_BUILD_SA}" "roles/artifactregistry.writer"

echo ""
echo "2) Cloud Run runtime → Firestore job state"
bind_project_role "serviceAccount:${RUNTIME_SA}" "roles/datastore.user"

echo ""
echo "3) Scheduler invoker service account"
if ! gcloud iam service-accounts describe "${SCHEDULER_SA}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create account-mgmt-cron-invoker \
    --project="${PROJECT_ID}" \
    --display-name="Account Mgmt Cron Invoker"
fi

if gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "  + roles/run.invoker on ${SERVICE_NAME}"
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --member="serviceAccount:${SCHEDULER_SA}" \
    --role="roles/run.invoker" \
    --quiet
else
  echo "  (skip run.invoker — deploy Cloud Run first, then re-run this script)"
fi

if [[ -n "${DEVELOPER_EMAIL}" ]]; then
  echo ""
  echo "4) Developer access for ${DEVELOPER_EMAIL}"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/cloudbuild.builds.editor"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/run.developer"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/cloudscheduler.admin"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/serviceusage.serviceUsageConsumer"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/artifactregistry.writer"
  bind_project_role "user:${DEVELOPER_EMAIL}" "roles/iam.serviceAccountUser"
fi

echo ""
echo "✅ Admin IAM grants applied."
