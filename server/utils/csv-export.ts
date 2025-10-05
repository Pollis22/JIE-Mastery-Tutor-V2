import { User } from "@shared/schema";

export function convertUsersToCSV(users: User[]): string {
  // CSV headers
  const headers = [
    'Name',
    'Email',
    'Parent Name',
    'Student Name',
    'Student Age',
    'Grade Level',
    'Primary Subject',
    'Subscription Status',
    'Plan Tier',
    'Minutes Remaining',
    'Bonus Minutes',
    'Last Active',
    'Days Since Active',
    'Marketing Opt-In',
    'Account Created'
  ];
  
  const rows = users.map(user => {
    const lastActive = user.updatedAt ? new Date(user.updatedAt) : null;
    const daysSinceActive = lastActive 
      ? Math.floor((Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
      : 'Never';
    
    const minutesRemaining = (user.monthlyVoiceMinutes || 0) - (user.monthlyVoiceMinutesUsed || 0);
    
    return [
      user.username || '',
      user.email || '',
      user.parentName || '',
      user.studentName || '',
      user.studentAge?.toString() || '',
      user.gradeLevel || '',
      user.primarySubject || '',
      user.subscriptionStatus || 'Free',
      user.subscriptionPlan || 'None',
      minutesRemaining.toString(),
      (user.bonusMinutes || 0).toString(),
      lastActive ? lastActive.toISOString().split('T')[0] : 'Never',
      daysSinceActive.toString(),
      user.marketingOptIn ? 'Yes' : 'No',
      user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : ''
    ];
  });
  
  // Escape CSV fields
  const escape = (field: string) => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };
  
  // Build CSV
  const csvRows = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(','))
  ];
  
  return csvRows.join('\n');
}

export function generateFilename(segment: string): string {
  const date = new Date().toISOString().split('T')[0];
  const segmentName = segment.replace(/-/g, '_');
  return `contacts-${segmentName}-${date}.csv`;
}
