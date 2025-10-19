#!/bin/bash

# Test session history API
echo "Testing session history for user pollis@mfhfoods.com..."

# Get user ID for pollis@mfhfoods.com
USER_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM users WHERE email = 'pollis@mfhfoods.com';" | xargs)

if [ -z "$USER_ID" ]; then
  echo "User not found!"
  exit 1
fi

echo "User ID: $USER_ID"

# Check how many sessions exist for this user
SESSION_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM realtime_sessions WHERE user_id = '$USER_ID';" | xargs)
echo "Total sessions in database: $SESSION_COUNT"

# Check how many ended sessions exist
ENDED_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM realtime_sessions WHERE user_id = '$USER_ID' AND status = 'ended';" | xargs)
echo "Ended sessions: $ENDED_COUNT"

# Display recent sessions
echo -e "\nRecent sessions (up to 5):"
psql "$DATABASE_URL" -c "
SELECT 
  id,
  status,
  started_at,
  ended_at,
  minutes_used,
  (transcript IS NOT NULL AND transcript != '[]'::jsonb) as has_content
FROM realtime_sessions 
WHERE user_id = '$USER_ID'
ORDER BY started_at DESC 
LIMIT 5;"

echo -e "\n✅ Test complete!"