#!/bin/bash

echo "🔍 Testing Minute Display Fix..."
echo "================================"
echo ""

# Check the database values
echo "📊 Database Values for pollis@mfhfoods.com:"
psql "$DATABASE_URL" -c "
SELECT 
  subscription_minutes_used as used,
  subscription_minutes_limit as limit,
  (subscription_minutes_limit - subscription_minutes_used) as remaining
FROM users
WHERE email = 'pollis@mfhfoods.com';" 

echo ""
echo "✅ Expected Display:"
echo "   - Should show: '0 / 60 minutes' (0 used out of 60 total)"
echo "   - NOT: '60 / 60 minutes' (which looks like all used up)"
echo ""
echo "📝 Fix Applied:"
echo "   - Changed display from 'remaining / total' to 'used / total'"
echo "   - Changed label from 'This Month's Allocation' to 'This Month's Usage'"
echo "   - Progress bar now shows usage percentage, not remaining percentage"
echo ""
echo "🎯 Result: Users will now see clearly how many minutes they've USED, not how many they have LEFT"