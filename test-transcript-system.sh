#!/bin/bash
# Test script to verify transcript storage and retrieval

echo "=== Testing Transcript Storage & Retrieval System ==="
echo ""

# Test 1: Check if realtime_sessions table exists
echo "Test 1: Checking database schema..."
npm run db:push 2>&1 | grep -q "error" && echo "❌ Database schema issues" || echo "✅ Database schema OK"
echo ""

# Test 2: Check recent sessions
echo "Test 2: Querying recent sessions with transcript counts..."
echo "SELECT id, student_name, status, jsonb_array_length(COALESCE(transcript, '[]'::jsonb)) as transcript_count FROM realtime_sessions ORDER BY started_at DESC LIMIT 5;" | psql $DATABASE_URL
echo ""

# Test 3: Test API endpoints
echo "Test 3: Testing API endpoints..."
curl -s http://localhost:5000/api/health | jq -r '"✅ Health endpoint: \(.status)"'
echo ""

echo "=== Manual Test Steps ==="
echo "1. Start a voice session in the UI"
echo "2. Speak a few words to generate transcripts"
echo "3. End the session"
echo "4. Check database: SELECT transcript FROM realtime_sessions WHERE id='<session-id>';"
echo "5. Go to Dashboard > Learning Sessions > View Full Transcript"
echo ""
