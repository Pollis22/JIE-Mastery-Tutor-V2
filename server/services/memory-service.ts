import { db } from '../db';
import { sessionSummaries, memoryJobs, realtimeSessions } from '@shared/schema';
import { eq, and, desc, sql, lt, isNotNull } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const MAX_SUMMARIES = 5;
const MAX_SUMMARY_CHARS = 400;
const MAX_CONTINUITY_BLOCK_CHARS = 2500;
const MAX_JOB_ATTEMPTS = 3;
const MAX_TRANSCRIPT_CHARS_FOR_LLM = 12000; // ~3000 tokens
const MAX_STORED_SUMMARY_TEXT = 1000;
const MAX_STORED_ARRAY_ITEMS = 10;
const MAX_STORED_ITEM_LENGTH = 100;

interface EnqueueJobParams {
  userId: string;
  studentId?: string | null;
  sessionId: string;
}

interface SummaryResult {
  summary_text: string;
  topics_covered: string[];
  concepts_mastered: string[];
  concepts_struggled: string[];
  student_insights: string;
  subject: string;
  grade_band: string;
}

export async function enqueueSessionSummaryJob(params: EnqueueJobParams): Promise<void> {
  try {
    console.log(`[MEMORY] Enqueuing summary job for session ${params.sessionId}`);
    
    await db.insert(memoryJobs).values({
      jobType: 'SESSION_SUMMARY',
      userId: params.userId,
      studentId: params.studentId || null,
      sessionId: params.sessionId,
      status: 'pending',
      attempts: 0,
      runAfter: new Date(),
    }).onConflictDoNothing();
    
    console.log(`[MEMORY] ✅ Summary job enqueued for session ${params.sessionId}`);
  } catch (error) {
    console.warn(`[MEMORY] ⚠️ Failed to enqueue summary job:`, error);
  }
}

export async function getRecentSessionSummaries(params: {
  userId: string;
  studentId?: string | null;
  limit?: number;
}): Promise<typeof sessionSummaries.$inferSelect[]> {
  const { userId, studentId, limit = MAX_SUMMARIES } = params;
  
  try {
    // STRICT STUDENT ISOLATION: Only query summaries for the specific student
    // If studentId is provided, filter by both userId AND studentId
    // If no studentId, filter by userId AND where studentId is null (sessions without student profile)
    const summaries = await db.select()
      .from(sessionSummaries)
      .where(
        studentId 
          ? and(
              eq(sessionSummaries.userId, userId),
              eq(sessionSummaries.studentId, studentId)
            )
          : and(
              eq(sessionSummaries.userId, userId),
              sql`${sessionSummaries.studentId} IS NULL`
            )
      )
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(limit);
    
    console.log(`[CONTINUITY] loading summary student_profile_id=${studentId || 'null'} user_id=${userId} found=${summaries.length > 0} count=${summaries.length}`);
    return summaries;
  } catch (error) {
    console.warn(`[MEMORY] ⚠️ Failed to retrieve summaries:`, error);
    return [];
  }
}

function trimToLength(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

export function buildContinuityBlock(summaries: typeof sessionSummaries.$inferSelect[]): string {
  if (!summaries || summaries.length === 0) {
    return '';
  }
  
  try {
    const limitedSummaries = summaries.slice(0, MAX_SUMMARIES);
    
    const bulletPoints = limitedSummaries.map((s, i) => {
      const trimmedSummary = trimToLength(s.summaryText, MAX_SUMMARY_CHARS);
      const topics = s.topicsCovered?.slice(0, 3).join(', ') || 'N/A';
      const struggled = s.conceptsStruggled?.slice(0, 2).join(', ') || 'none noted';
      const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'recent';
      
      return `• Session ${i + 1} (${date}): ${trimmedSummary} Topics: ${topics}. Struggled with: ${struggled}.`;
    });
    
    let block = bulletPoints.join('\n');
    
    if (block.length > MAX_CONTINUITY_BLOCK_CHARS) {
      block = block.substring(0, MAX_CONTINUITY_BLOCK_CHARS - 3) + '...';
    }
    
    return block;
  } catch (error) {
    console.warn(`[MEMORY] ⚠️ Failed to build continuity block:`, error);
    return '';
  }
}

export function formatContinuityPromptSection(summaries: typeof sessionSummaries.$inferSelect[]): string {
  const block = buildContinuityBlock(summaries);
  
  if (!block) {
    return '';
  }
  
  return `
<continuity_memory>
The following is a brief summary of the student's recent tutoring sessions. Use this context naturally when relevant, but do not reveal private metadata. If the student's current statement conflicts with this memory, ask a clarifying question.

${block}
</continuity_memory>
`;
}

function sanitizeArrayField(arr: string[] | undefined | null, maxItems: number, maxItemLen: number): string[] {
  if (!arr || !Array.isArray(arr)) return [];
  return arr
    .slice(0, maxItems)
    .map(item => typeof item === 'string' ? item.substring(0, maxItemLen) : String(item).substring(0, maxItemLen))
    .filter(item => item.length > 0);
}

async function generateSessionSummary(
  transcript: Array<{ speaker: string; text: string; timestamp: string }>,
  subject?: string | null,
  gradeBand?: string | null
): Promise<SummaryResult | null> {
  try {
    const anthropic = new Anthropic();
    
    // Limit transcript to last 50 messages AND cap total characters
    let transcriptText = transcript
      .slice(-50)
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');
    
    // Hard cap on transcript size to prevent token explosion
    if (transcriptText.length > MAX_TRANSCRIPT_CHARS_FOR_LLM) {
      transcriptText = transcriptText.substring(transcriptText.length - MAX_TRANSCRIPT_CHARS_FOR_LLM);
      console.log(`[MEMORY] Transcript truncated to ${MAX_TRANSCRIPT_CHARS_FOR_LLM} chars`);
    }
    
    if (transcriptText.length < 50) {
      console.log('[MEMORY] Transcript too short for summary');
      return null;
    }
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this tutoring session transcript and produce a structured JSON summary. Be concise.

Subject: ${subject || 'Unknown'}
Grade Band: ${gradeBand || 'Unknown'}

Transcript:
${transcriptText}

Respond ONLY with valid JSON in this exact format:
{
  "summary_text": "2-3 sentence summary of what was covered and how the student performed",
  "topics_covered": ["topic1", "topic2"],
  "concepts_mastered": ["concept1"],
  "concepts_struggled": ["concept1"],
  "student_insights": "1-2 sentences about student's learning style or notable behaviors",
  "subject": "${subject || 'general'}",
  "grade_band": "${gradeBand || 'unknown'}"
}`
      }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      return null;
    }
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[MEMORY] Could not extract JSON from Claude response');
      return null;
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as SummaryResult;
    return parsed;
  } catch (error) {
    console.warn('[MEMORY] ⚠️ Failed to generate summary:', error);
    return null;
  }
}

export async function processPendingMemoryJobs(limit = 5): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0 };
  
  try {
    const jobs = await db.select()
      .from(memoryJobs)
      .where(
        and(
          eq(memoryJobs.status, 'pending'),
          lt(memoryJobs.runAfter, new Date())
        )
      )
      .orderBy(memoryJobs.createdAt)
      .limit(limit);
    
    console.log(`[MEMORY] Found ${jobs.length} pending jobs`);
    
    for (const job of jobs) {
      stats.processed++;
      
      try {
        await db.update(memoryJobs)
          .set({ 
            status: 'processing',
            updatedAt: new Date()
          })
          .where(eq(memoryJobs.id, job.id));
        
        const session = await db.select()
          .from(realtimeSessions)
          .where(eq(realtimeSessions.id, job.sessionId))
          .limit(1);
        
        if (!session[0]) {
          throw new Error(`Session ${job.sessionId} not found`);
        }
        
        const transcript = session[0].transcript as Array<{ speaker: string; text: string; timestamp: string }> || [];
        
        if (transcript.length < 3) {
          console.log(`[MEMORY] Session ${job.sessionId} has too few messages, marking done`);
          await db.update(memoryJobs)
            .set({ 
              status: 'done',
              updatedAt: new Date()
            })
            .where(eq(memoryJobs.id, job.id));
          stats.succeeded++;
          continue;
        }
        
        const summary = await generateSessionSummary(
          transcript,
          session[0].subject,
          session[0].ageGroup
        );
        
        if (!summary) {
          throw new Error('Failed to generate summary');
        }
        
        // SANITIZE before persistence to enforce size caps
        const sanitizedSummary = {
          summaryText: (summary.summary_text || '').substring(0, MAX_STORED_SUMMARY_TEXT),
          topicsCovered: sanitizeArrayField(summary.topics_covered, MAX_STORED_ARRAY_ITEMS, MAX_STORED_ITEM_LENGTH),
          conceptsMastered: sanitizeArrayField(summary.concepts_mastered, MAX_STORED_ARRAY_ITEMS, MAX_STORED_ITEM_LENGTH),
          conceptsStruggled: sanitizeArrayField(summary.concepts_struggled, MAX_STORED_ARRAY_ITEMS, MAX_STORED_ITEM_LENGTH),
          studentInsights: (summary.student_insights || '').substring(0, MAX_STORED_SUMMARY_TEXT),
          subject: (summary.subject || '').substring(0, 100),
          gradeBand: (summary.grade_band || '').substring(0, 50),
        };
        
        await db.insert(sessionSummaries).values({
          userId: job.userId,
          studentId: job.studentId,
          sessionId: job.sessionId,
          summaryText: sanitizedSummary.summaryText,
          topicsCovered: sanitizedSummary.topicsCovered,
          conceptsMastered: sanitizedSummary.conceptsMastered,
          conceptsStruggled: sanitizedSummary.conceptsStruggled,
          studentInsights: sanitizedSummary.studentInsights,
          subject: sanitizedSummary.subject,
          gradeBand: sanitizedSummary.gradeBand,
          durationMinutes: session[0].minutesUsed,
        }).onConflictDoUpdate({
          target: sessionSummaries.sessionId,
          set: {
            summaryText: sanitizedSummary.summaryText,
            topicsCovered: sanitizedSummary.topicsCovered,
            conceptsMastered: sanitizedSummary.conceptsMastered,
            conceptsStruggled: sanitizedSummary.conceptsStruggled,
            studentInsights: sanitizedSummary.studentInsights,
          }
        });
        
        await db.update(memoryJobs)
          .set({ 
            status: 'done',
            updatedAt: new Date()
          })
          .where(eq(memoryJobs.id, job.id));
        
        stats.succeeded++;
        console.log(`[MEMORY] ✅ Successfully processed job for session ${job.sessionId}`);
        
        // Trigger LSIS concept extraction for this session
        try {
          const { triggerLSISProcessing } = await import('./lsis-service');
          await triggerLSISProcessing(job.sessionId);
        } catch (lsisError) {
          console.error('[MEMORY] LSIS trigger failed (non-blocking):', lsisError);
        }
        
      } catch (error) {
        stats.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const newAttempts = job.attempts + 1;
        
        console.warn(`[MEMORY] ⚠️ Job ${job.id} failed (attempt ${newAttempts}):`, errorMessage);
        
        if (newAttempts >= MAX_JOB_ATTEMPTS) {
          await db.update(memoryJobs)
            .set({ 
              status: 'error',
              attempts: newAttempts,
              lastError: errorMessage,
              updatedAt: new Date()
            })
            .where(eq(memoryJobs.id, job.id));
        } else {
          const retryAfter = new Date(Date.now() + 5 * 60 * 1000);
          await db.update(memoryJobs)
            .set({ 
              status: 'pending',
              attempts: newAttempts,
              lastError: errorMessage,
              runAfter: retryAfter,
              updatedAt: new Date()
            })
            .where(eq(memoryJobs.id, job.id));
        }
      }
    }
    
    console.log(`[MEMORY] Job processing complete: ${stats.processed} processed, ${stats.succeeded} succeeded, ${stats.failed} failed`);
    return stats;
    
  } catch (error) {
    console.error('[MEMORY] ❌ Fatal error in job processor:', error);
    return stats;
  }
}

export async function runOpportunisticJob(): Promise<void> {
  try {
    const result = await processPendingMemoryJobs(1);
    console.log(`[MEMORY] Opportunistic job run: ${result.succeeded} completed`);
  } catch (error) {
    console.warn('[MEMORY] ⚠️ Opportunistic job failed (non-blocking):', error);
  }
}
