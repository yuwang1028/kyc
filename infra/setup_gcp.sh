#!/usr/bin/env bash
# GCP 一键初始化脚本 — 创建所有所需服务
# 使用前: gcloud auth login && gcloud config set project just-site-493900-d9
set -euo pipefail

PROJECT_ID="just-site-493900-d9"
REGION="us-central1"
DB_INSTANCE="kyc-db"
DB_NAME="kyc"
DB_USER="kyc"
GCS_BUCKET="${PROJECT_ID}-kyc-documents"
SA_NAME="kyc-backend"
AR_REPO="kyc"

echo "==> 启用 GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

echo "==> 创建 Artifact Registry 仓库..."
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" || echo "已存在，跳过"

echo "==> 创建 Cloud SQL PostgreSQL 实例（db-f1-micro，最小规格）..."
gcloud sql instances create "${DB_INSTANCE}" \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --project="${PROJECT_ID}" || echo "已存在，跳过"

echo "==> 创建数据库和用户..."
gcloud sql databases create "${DB_NAME}" --instance="${DB_INSTANCE}" --project="${PROJECT_ID}" || echo "已存在，跳过"

DB_PASSWORD=$(openssl rand -base64 24)
gcloud sql users create "${DB_USER}" \
  --instance="${DB_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  --project="${PROJECT_ID}" || echo "已存在，跳过"

echo "==> 保存 DB 密码到 Secret Manager..."
echo -n "${DB_PASSWORD}" | gcloud secrets create kyc-db-password --data-file=- --project="${PROJECT_ID}" || \
  echo -n "${DB_PASSWORD}" | gcloud secrets versions add kyc-db-password --data-file=- --project="${PROJECT_ID}"

echo "==> 创建 GCS 存储桶..."
gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${GCS_BUCKET}" || echo "已存在，跳过"
gsutil uniformbucketlevelaccess set on "gs://${GCS_BUCKET}"

echo -n "${GCS_BUCKET}" | gcloud secrets create kyc-gcs-bucket --data-file=- --project="${PROJECT_ID}" || \
  echo -n "${GCS_BUCKET}" | gcloud secrets versions add kyc-gcs-bucket --data-file=- --project="${PROJECT_ID}"

echo -n "${PROJECT_ID}" | gcloud secrets create kyc-vertex-project --data-file=- --project="${PROJECT_ID}" || \
  echo -n "${PROJECT_ID}" | gcloud secrets versions add kyc-vertex-project --data-file=- --project="${PROJECT_ID}"

echo "==> 创建后端服务账号..."
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="KYC Backend Service Account" \
  --project="${PROJECT_ID}" || echo "已存在，跳过"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> 授权服务账号..."
for role in \
  roles/cloudsql.client \
  roles/storage.objectAdmin \
  roles/aiplatform.user \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}"
done

echo ""
echo "✅ GCP 初始化完成！"
echo "Cloud SQL 连接名: ${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
echo "GCS 存储桶: gs://${GCS_BUCKET}"
echo "服务账号: ${SA_EMAIL}"
echo ""
echo "下一步: gcloud builds submit --config infra/cloudbuild.yaml ."
