#!/bin/bash

set -e

# Configuration
SERVICE_NAME="health-data-storage"
REGION="us-central1"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GOOGLE_CLOUD_PROJECT environment variable is not set"
  exit 1
fi

echo "🚀 Deploying Health Data Storage API to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"

# Check if API_SECRET is set
if [ -z "$API_SECRET" ]; then
  echo "⚠️  Warning: API_SECRET not set. Generating a random secret..."
  API_SECRET=$(openssl rand -base64 32)
  echo "Generated API_SECRET: $API_SECRET"
  echo "⚠️  Save this secret! You'll need it for iOS app and MCP servers."
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL environment variable is not set"
  echo "Example: postgresql://user:password@host:5432/dbname"
  exit 1
fi

# Build and deploy
echo "📦 Building container..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=$DATABASE_URL,API_SECRET=$API_SECRET" \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10

echo "✅ Deployment complete!"
echo ""
echo "Service URL:"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")
echo "$SERVICE_URL"
echo ""
echo "Test the API:"
echo "curl $SERVICE_URL/health"
