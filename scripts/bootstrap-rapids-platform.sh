#!/usr/bin/env bash
# One-time GCP bootstrap for cloud cron on rapids-platform.
# Run after: gcloud auth login && gcloud config set project rapids-platform

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-rapids-platform}"
REGION="${REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-account-mgmt}"

try_iam_binding() {
  local description="$1"
  shift
  echo "${description}"
  if "$@" >/dev/null 2>&1; then
    echo "   ✓ done"
    return 0
  fi
  echo "   ⚠ skipped — missing permission (ask project admin to run scripts/iam-grants-for-admin.sh)"
  return 1
}

echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"

echo ""
echo "Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repo: ${ARTIFACT_REPO}"
  gcloud artifacts repositories create "${ARTIFACT_REPO}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository-format=docker \
    --description="Account management dashboard containers"
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

try_iam_binding "Granting Cloud Build → Cloud Run deploy..." \
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin" \
    --quiet || true

try_iam_binding "Granting Cloud Build → service account user..." \
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --quiet || true

echo ""
echo "✅ Bootstrap complete (APIs + Artifact Registry)."
echo ""
echo "If IAM steps were skipped, send scripts/iam-grants-for-admin.sh to your rapids-platform admin:"
echo "   DEVELOPER_EMAIL=aviral@risalabs.ai bash scripts/iam-grants-for-admin.sh"
echo ""
echo "Next steps:"
echo "   1. npm run deploy:cron"
echo "   2. Add .env secrets to Cloud Run service account-mgmt-cron (Console)"
echo "   3. npm run setup:cloud-scheduler"
