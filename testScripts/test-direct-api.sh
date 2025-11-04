#!/bin/bash

# Test script for direct vlayer Web Prover API call
# Tests proving vlayer GitHub contributors endpoint

echo "Testing direct vlayer Web Prover API call..."
echo "URL: https://api.github.com/repos/vlayer-xyz/vlayer/contributors"
echo ""

# Check if environment variables are set
if [ -z "$WEB_PROVER_API_CLIENT_ID" ] || [ -z "$WEB_PROVER_API_SECRET" ]; then
    echo "Error: WEB_PROVER_API_CLIENT_ID and WEB_PROVER_API_SECRET must be set"
    echo "Please set them in your environment or .env.local file"
    exit 1
fi

# Check for GitHub token
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Note: GITHUB_TOKEN not set. This is optional but required for private repos."
    echo ""
fi

# Prepare the request payload with optional GitHub token
if [ -n "$GITHUB_TOKEN" ]; then
    REQUEST_BODY="{
  \"url\": \"https://api.github.com/repos/vlayer-xyz/vlayer/contributors\",
  \"headers\": [
    \"User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36\",
    \"Accept: application/vnd.github+json\",
    \"Authorization: Bearer $GITHUB_TOKEN\"
  ]
}"
else
    REQUEST_BODY='{
  "url": "https://api.github.com/repos/vlayer-xyz/vlayer/contributors",
  "headers": [
    "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Accept: application/vnd.github+json"
  ]
}'
fi

echo "=========================================="
echo "Curl Command (copy to share):"
echo "=========================================="
cat <<EOF
curl -X POST https://web-prover.vlayer.xyz/api/v1/prove \\
  -H "Content-Type: application/json" \\
  -H "x-client-id: $WEB_PROVER_API_CLIENT_ID" \\
  -H "Authorization: Bearer $WEB_PROVER_API_SECRET" \\
  -d '$REQUEST_BODY'
EOF
echo ""
echo "=========================================="
echo ""

echo "Starting request at: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Record start time
START_TIME=$(date +%s)

# Make the API call
RESPONSE=$(curl -X POST https://web-prover.vlayer.xyz/api/v1/prove \
  -H "Content-Type: application/json" \
  -H "x-client-id: $WEB_PROVER_API_CLIENT_ID" \
  -H "Authorization: Bearer $WEB_PROVER_API_SECRET" \
  -d "$REQUEST_BODY" \
  -w "\n%{http_code}" \
  -s \
  --max-time 300)

# Record end time
END_TIME=$(date +%s)

# Calculate duration
DURATION=$((END_TIME - START_TIME))

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

# Extract response body (everything except last line)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

echo "Completed at: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "=========================================="
echo "Results:"
echo "=========================================="
echo "HTTP Status Code: $HTTP_CODE"
echo "Duration: ${DURATION} seconds ($(($DURATION / 60))m $(($DURATION % 60))s)"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Success! Proof generated."
    echo ""
    echo "Response preview (first 500 characters):"
    echo "$RESPONSE_BODY" | head -c 500
    echo ""
    echo "..."
    echo ""

    # Save full response to file
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    OUTPUT_FILE="proof_response_direct_${TIMESTAMP}.json"
    echo "$RESPONSE_BODY" > "$OUTPUT_FILE"
    echo "Full response saved to: $OUTPUT_FILE"
else
    echo "✗ Error occurred"
    echo ""
    echo "Response:"
    echo "$RESPONSE_BODY"
fi

echo ""
echo "=========================================="
