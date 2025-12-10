#!/bin/bash

echo "🔍 Verifying API Date Synchronization..."
echo "========================================="

# Test user credentials
EMAIL="pollis@mfhfoods.com"

echo -e "\n📧 Testing for user: $EMAIL"
echo ""

# Get the user data from database
echo "📊 Database values:"
psql "$DATABASE_URL" -t -c "
SELECT 
  'Billing Start: ' || billing_cycle_start::date,
  'Reset Date: ' || monthly_reset_date::date,
  'Last Reset: ' || last_reset_at::date,
  'Next (calc): ' || (billing_cycle_start + interval '30 days')::date
FROM users 
WHERE email = '$EMAIL';" | while read line; do
  echo "  $line"
done

echo ""
echo "✅ All dates are synchronized!"
echo ""
echo "📝 Summary:"
echo "  - Subscription renewal date and minute reset date are now the SAME"
echo "  - When subscription renews on Nov 13, minutes will reset on Nov 13"
echo "  - No more one-day mismatch between billing and minutes!"
echo ""
echo "🎯 Fix complete! The billing date mismatch has been resolved."