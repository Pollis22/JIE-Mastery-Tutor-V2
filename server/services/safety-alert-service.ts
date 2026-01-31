/**
 * Safety Alert Service
 * Sends admin email notifications for critical safety incidents
 */

import { Resend } from 'resend';
import { db } from '../db';
import { safetyIncidents } from '@shared/schema';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface SafetyAlertData {
  flagType: string;
  severity: 'info' | 'warning' | 'alert' | 'critical';
  sessionId: string;
  studentId?: string;
  studentName?: string;
  gradeLevel?: string;
  parentEmail?: string;
  userId?: string;
  triggerText: string;
  tutorResponse: string;
  actionTaken: string;
}

const ADMIN_ALERT_TRIGGERS = [
  'SELF_HARM_CONCERN',
  'VIOLENCE_CONCERN',
  'ABUSE_DISCLOSURE',
  'SESSION_TERMINATED_CONDUCT',
  'SEVERE_CONDUCT'
];

// Safety incident types that require immediate JIE Support notification
const SAFETY_INCIDENT_TYPES = [
  'profanity',
  'self_harm',
  'violent_threat',
  'harm_to_others',
  'harmful',
  'sexual',
  'hate'
];

export type SafetyIncidentType = 'profanity' | 'self_harm' | 'violent_threat' | 'harm_to_others' | 'harmful' | 'sexual' | 'hate' | 'other';

export interface SafetyIncidentNotification {
  incidentType: SafetyIncidentType;
  severity: 'low' | 'medium' | 'high';
  sessionId: string;
  userId: string;
  studentName?: string;
  parentEmail?: string;
  triggerText: string;
  matchedTerms?: string[];
  actionTaken: string;
  timestamp: Date;
}

export async function logSafetyIncident(data: SafetyAlertData): Promise<void> {
  try {
    await db.insert(safetyIncidents).values({
      sessionId: data.sessionId,
      studentId: data.studentId || null,
      userId: data.userId || null,
      flagType: data.flagType,
      severity: data.severity,
      triggerText: data.triggerText,
      tutorResponse: data.tutorResponse,
      actionTaken: data.actionTaken,
      adminNotified: ADMIN_ALERT_TRIGGERS.includes(data.flagType),
      parentNotified: false,
    });

    console.log(`[SafetyAlert] Incident logged: ${data.flagType} for session ${data.sessionId}`);
  } catch (error) {
    console.error('[SafetyAlert] Failed to log incident:', error);
  }
}

export async function sendAdminSafetyAlert(data: SafetyAlertData): Promise<boolean> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'pollis@jiemastery.com';
  
  if (!ADMIN_ALERT_TRIGGERS.includes(data.flagType)) {
    return false;
  }

  const subject = `[JIE Mastery ALERT] ${data.flagType} - Session ${data.sessionId.slice(0, 8)}`;
  
  const body = `
SAFETY ALERT - Immediate Review Required

Alert Type: ${data.flagType}
Severity: ${data.severity.toUpperCase()}
Timestamp: ${new Date().toISOString()}

Student Info:
- Student ID: ${data.studentId || 'N/A'}
- Student Name: ${data.studentName || 'N/A'}
- Age Group: ${data.gradeLevel || 'N/A'}
- Parent Account: ${data.parentEmail || 'N/A'}

Session Details:
- Session ID: ${data.sessionId}

Trigger Content:
"${redactSensitiveContent(data.triggerText)}"

Tutor Response:
"${data.tutorResponse}"

Action Taken:
${data.actionTaken}

---
Review full transcript in admin dashboard.

This is an automated alert from JIE Mastery Safety System.
  `.trim();

  // Log the incident first
  await logSafetyIncident(data);

  // Send email if Resend is configured
  if (resend) {
    try {
      await resend.emails.send({
        from: 'JIE Mastery Safety <safety@jiemastery.com>',
        to: adminEmail,
        subject,
        text: body,
      });
      
      console.log(`[SafetyAlert] Admin notified via email: ${data.flagType} for session ${data.sessionId}`);
      return true;
    } catch (error) {
      console.error('[SafetyAlert] Failed to send admin email:', error);
      // Still return true since we logged the incident
      return true;
    }
  } else {
    console.log(`[SafetyAlert] Email not configured, incident logged only: ${data.flagType}`);
    console.log(`[SafetyAlert] Alert details:\n${body}`);
    return true;
  }
}

export async function sendParentAlert(data: SafetyAlertData): Promise<boolean> {
  if (!data.parentEmail || !resend) {
    console.log('[SafetyAlert] Parent alert skipped - no email or Resend not configured');
    return false;
  }

  // Don't alert parent for abuse disclosure (could be the abuser)
  if (data.flagType === 'ABUSE_DISCLOSURE') {
    return false;
  }

  const subject = `[JIE Mastery] Tutoring Session Alert - ${data.studentName || 'Your Child'}`;
  
  const body = `
Dear Parent/Guardian,

This is an automated alert regarding your child's tutoring session.

Alert Type: ${getFriendlyFlagName(data.flagType)}
Time: ${new Date().toLocaleString()}

${getParentFriendlyDescription(data.flagType)}

Session ID: ${data.sessionId.slice(0, 8)}...

You can review the full transcript by logging into your JIE Mastery account.

If you have concerns, please contact us at support@jiemastery.com.

Best regards,
JIE Mastery Team
  `.trim();

  try {
    await resend.emails.send({
      from: 'JIE Mastery <notifications@jiemastery.com>',
      to: data.parentEmail,
      subject,
      text: body,
    });
    
    console.log(`[SafetyAlert] Parent notified: ${data.flagType} for ${data.parentEmail}`);
    return true;
  } catch (error) {
    console.error('[SafetyAlert] Failed to send parent email:', error);
    return false;
  }
}

function redactSensitiveContent(text: string): string {
  // Redact severe profanity for email
  const profanityPatterns = [
    /\bf[u*@#]ck\w*/gi,
    /\bs[h*@#]it\w*/gi,
    /\bn[i*@#]gg\w*/gi,
  ];
  
  let redacted = text;
  profanityPatterns.forEach(pattern => {
    redacted = redacted.replace(pattern, '[REDACTED]');
  });
  
  return redacted;
}

function getFriendlyFlagName(flagType: string): string {
  const names: Record<string, string> = {
    'SELF_HARM_CONCERN': 'Wellbeing Concern',
    'VIOLENCE_CONCERN': 'Safety Concern',
    'SEVERE_LANGUAGE': 'Language Issue',
    'LANGUAGE_CONCERN': 'Language Reminder',
    'STUDENT_CONDUCT': 'Behavior Reminder',
    'SEVERE_CONDUCT': 'Behavior Concern',
    'SESSION_TERMINATED_CONDUCT': 'Session Ended Early',
  };
  
  return names[flagType] || 'Session Alert';
}

function getParentFriendlyDescription(flagType: string): string {
  const descriptions: Record<string, string> = {
    'SELF_HARM_CONCERN': 'During the tutoring session, your child expressed something that concerned us about their wellbeing. We provided them with crisis resources (988 Suicide & Crisis Lifeline). We recommend checking in with them.',
    'VIOLENCE_CONCERN': 'During the tutoring session, your child mentioned something related to violence. We responded with care and encouraged them to speak with a trusted adult.',
    'SEVERE_LANGUAGE': 'Your child used inappropriate language during the tutoring session. The tutor redirected them back to learning.',
    'LANGUAGE_CONCERN': 'Your child used language that was redirected by the tutor to maintain an appropriate learning environment.',
    'STUDENT_CONDUCT': 'Your child was reminded to communicate respectfully with the tutor during the session.',
    'SEVERE_CONDUCT': 'Due to concerning behavior, the tutor had to address conduct with your child during the session.',
    'SESSION_TERMINATED_CONDUCT': 'The tutoring session was ended early due to repeated conduct issues. Please discuss appropriate behavior with your child before their next session.',
  };
  
  return descriptions[flagType] || 'An alert was generated during the tutoring session.';
}

/**
 * Send JIE Support notification for safety incidents
 * This sends an internal notification for all safety-related session terminations
 */
export async function sendJIESupportNotification(data: SafetyIncidentNotification): Promise<boolean> {
  const jieSuportEmail = process.env.JIE_SUPPORT_EMAIL || process.env.ADMIN_EMAIL || 'pollis@jiemastery.com';
  
  // Only notify for actual safety incidents
  if (!SAFETY_INCIDENT_TYPES.includes(data.incidentType)) {
    console.log(`[SafetyAlert] Skipping JIE support notification for non-safety incident: ${data.incidentType}`);
    return false;
  }
  
  const incidentLabels: Record<string, string> = {
    'profanity': 'Profanity',
    'self_harm': 'Self-Harm Ideation',
    'violent_threat': 'Violent Threat',
    'harm_to_others': 'Intent to Harm Others',
    'harmful': 'Harmful Content',
    'sexual': 'Sexual Content',
    'hate': 'Hate Speech',
    'other': 'Other Violation'
  };
  
  const incidentLabel = incidentLabels[data.incidentType] || data.incidentType;
  const isCritical = ['self_harm', 'violent_threat', 'harm_to_others'].includes(data.incidentType);
  
  const subject = isCritical 
    ? `[JIE Mastery CRITICAL] ${incidentLabel} - Immediate Review Required`
    : `[JIE Mastery SAFETY] ${incidentLabel} - Session ${data.sessionId.slice(0, 8)}`;
  
  const timestamp = data.timestamp.toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'long'
  });
  
  const body = `
${'='.repeat(60)}
JIE MASTERY SAFETY INCIDENT REPORT
${'='.repeat(60)}

INCIDENT TYPE: ${incidentLabel}
SEVERITY: ${data.severity.toUpperCase()}
TIMESTAMP: ${timestamp}
${isCritical ? '\n⚠️ CRITICAL: This incident requires immediate review.\n' : ''}
─────────────────────────────────────────────────────────────
STUDENT INFORMATION
─────────────────────────────────────────────────────────────
Student Name: ${data.studentName || 'N/A'}
Parent Email: ${data.parentEmail || 'N/A'}
User ID: ${data.userId}
Session ID: ${data.sessionId}

─────────────────────────────────────────────────────────────
INCIDENT DETAILS
─────────────────────────────────────────────────────────────
Trigger Text (sanitized):
"${redactSensitiveContent(data.triggerText.substring(0, 500))}"

Matched Terms: ${data.matchedTerms?.join(', ') || 'N/A'}

Action Taken: ${data.actionTaken}

─────────────────────────────────────────────────────────────
NEXT STEPS
─────────────────────────────────────────────────────────────
1. Review full transcript in Admin Dashboard → Safety tab
2. Assess if follow-up contact with parent is needed
3. Document any additional actions taken

${'='.repeat(60)}
This is an automated alert from JIE Mastery Safety System.
Generated at: ${new Date().toISOString()}
${'='.repeat(60)}
  `.trim();
  
  console.log(`[SafetyAlert] Sending JIE Support notification: ${incidentLabel} for session ${data.sessionId}`);
  
  if (resend) {
    try {
      await resend.emails.send({
        from: 'JIE Mastery Safety <safety@jiemastery.com>',
        to: jieSuportEmail,
        subject,
        text: body,
      });
      
      console.log(`[SafetyAlert] ✅ JIE Support notified via email: ${incidentLabel}`);
      return true;
    } catch (error) {
      console.error('[SafetyAlert] ⚠️ Failed to send JIE Support email (non-fatal):', error);
      return false;
    }
  } else {
    console.log(`[SafetyAlert] Email not configured, logging incident only:`);
    console.log(`[SafetyAlert] Subject: ${subject}`);
    console.log(`[SafetyAlert] Body:\n${body}`);
    return true;
  }
}

/**
 * Unified safety incident handler - call this for ALL safety terminations
 * Handles: logging, parent notification, and JIE support notification
 */
export async function handleSafetyIncident(data: SafetyIncidentNotification): Promise<void> {
  console.log(`[SafetyAlert] 🚨 Handling safety incident: ${data.incidentType} (severity: ${data.severity})`);
  
  // All operations are non-fatal - wrap in try/catch
  let parentNotified = false;
  let supportNotified = false;
  
  // 1. Send JIE Support notification (always for safety incidents)
  try {
    await sendJIESupportNotification(data);
    supportNotified = true;
  } catch (error) {
    console.error('[SafetyAlert] ⚠️ JIE Support notification failed (non-fatal):', error);
  }
  
  // 2. Send parent notification (if email available and not abuse-related)
  if (data.parentEmail) {
    try {
      const parentData: SafetyAlertData = {
        flagType: mapIncidentTypeToFlag(data.incidentType),
        severity: mapSeverityToAlert(data.severity),
        sessionId: data.sessionId,
        studentName: data.studentName,
        parentEmail: data.parentEmail,
        userId: data.userId,
        triggerText: data.triggerText,
        tutorResponse: 'Session was terminated for safety reasons.',
        actionTaken: data.actionTaken
      };
      await sendParentAlert(parentData);
      parentNotified = true;
    } catch (error) {
      console.error('[SafetyAlert] ⚠️ Parent notification failed (non-fatal):', error);
    }
  }
  
  // 3. Log to safetyIncidents table for Admin → Safety visibility
  try {
    await db.insert(safetyIncidents).values({
      sessionId: data.sessionId,
      userId: data.userId,
      flagType: mapIncidentTypeToFlag(data.incidentType),
      severity: 'critical', // All safety incidents from handleSafetyIncident are critical
      triggerText: data.triggerText,
      tutorResponse: 'Session was terminated for safety reasons.',
      actionTaken: data.actionTaken,
      adminNotified: supportNotified,
      parentNotified: parentNotified,
    });
    console.log(`[SafetyAlert] ✅ Incident logged to safety_incidents table`);
  } catch (dbError) {
    console.error('[SafetyAlert] ⚠️ Failed to log incident to safety_incidents (non-fatal):', dbError);
  }
  
  console.log(`[SafetyAlert] ✅ Safety incident handling complete for session ${data.sessionId}`);
}

function mapIncidentTypeToFlag(incidentType: SafetyIncidentType): string {
  const mapping: Record<string, string> = {
    'self_harm': 'SELF_HARM_CONCERN',
    'violent_threat': 'VIOLENCE_CONCERN',
    'harm_to_others': 'VIOLENCE_CONCERN',
    'profanity': 'SEVERE_LANGUAGE',
    'harmful': 'SEVERE_CONDUCT',
    'sexual': 'SEVERE_CONDUCT',
    'hate': 'SEVERE_CONDUCT',
    'other': 'SESSION_TERMINATED_CONDUCT'
  };
  return mapping[incidentType] || 'SESSION_TERMINATED_CONDUCT';
}

function mapSeverityToAlert(severity: 'low' | 'medium' | 'high'): 'info' | 'warning' | 'alert' | 'critical' {
  const mapping: Record<string, 'info' | 'warning' | 'alert' | 'critical'> = {
    'low': 'warning',
    'medium': 'alert',
    'high': 'critical'
  };
  return mapping[severity] || 'alert';
}
