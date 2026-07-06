#!/bin/bash

# Load environment variables
source .env

IMAGE_PATH="performance-table.png"
CHANNEL="${SLACK_CHANNEL:-C0A7LHVNF5M}"

echo "📤 Uploading $IMAGE_PATH to Slack channel $CHANNEL..."

# Upload using Slack Files API
curl -F file=@"$IMAGE_PATH" \
     -F "channels=$CHANNEL" \
     -F "title=📊 Daily Performance Breakdown" \
     -F "initial_comment=*Daily Performance Report* - Last 5 business days (Generated: $(date '+%B %d, %Y at %I:%M %p %Z'))" \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     https://slack.com/api/files.upload

echo ""
echo "✅ Done!"
