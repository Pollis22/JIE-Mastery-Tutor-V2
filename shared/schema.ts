import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  date,
  integer, 
  decimal, 
  boolean, 
  jsonb,
  index,
  uniqueIndex,
  customType
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)'; // OpenAI text-embedding-3-small dimensions
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Registration tokens table for payment-first registration
export const registrationTokens = pgTable(
  "registration_tokens",
  {
    token: varchar("token", { length: 64 }).primaryKey(),
    accountName: text("account_name").notNull(),
    studentName: text("student_name").notNull(),
    studentAge: integer("student_age"),
    gradeLevel: text("grade_level").notNull(),
    primarySubject: text("primary_subject"),
    email: text("email").notNull(),
    password: text("password").notNull(),
    selectedPlan: text("selected_plan").notNull().$type<'starter' | 'standard' | 'pro' | 'elite'>(),
    marketingOptIn: boolean("marketing_opt_in").default(false),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_registration_token_expires").on(table.expiresAt),
    index("IDX_registration_token_email").on(table.email),
  ],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  parentName: text("parent_name"),
  studentName: text("student_name"),
  studentAge: integer("student_age"),
  gradeLevel: text("grade_level").$type<'kindergarten-2' | 'grades-3-5' | 'grades-6-8' | 'grades-9-12' | 'college-adult'>(),
  primarySubject: text("primary_subject").$type<'math' | 'english' | 'science' | 'spanish' | 'general'>(),
  marketingOptIn: boolean("marketing_opt_in").default(false),
  marketingOptInDate: timestamp("marketing_opt_in_date"),
  marketingOptOutDate: timestamp("marketing_opt_out_date"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionPlan: text("subscription_plan").$type<'starter' | 'standard' | 'pro' | 'elite' | 'single' | 'all'>(),
  subscriptionStatus: text("subscription_status").$type<'active' | 'canceled' | 'inactive' | 'past_due' | 'trialing' | 'paused'>(),
  subscriptionEndsAt: timestamp("subscription_ends_at"), // When canceled subscription expires (grace period end)
  maxConcurrentSessions: integer("max_concurrent_sessions").default(1), // Elite tier allows up to 3 voice tutoring sessions
  maxConcurrentLogins: integer("max_concurrent_logins").default(1), // Elite tier allows up to 3 device logins
  // Hybrid Minute Tracking System
  subscriptionMinutesUsed: integer("subscription_minutes_used").default(0), // Monthly usage counter
  subscriptionMinutesLimit: integer("subscription_minutes_limit").default(60), // Monthly allowance
  purchasedMinutesBalance: integer("purchased_minutes_balance").default(0), // Rollover balance (never expires)
  billingCycleStart: timestamp("billing_cycle_start").defaultNow(), // When billing cycle started
  lastResetAt: timestamp("last_reset_at"), // When last reset occurred
  
  // Legacy fields (keep for backward compatibility)
  monthlyVoiceMinutes: integer("monthly_voice_minutes").default(60),
  monthlyVoiceMinutesUsed: integer("monthly_voice_minutes_used").default(0),
  bonusMinutes: integer("bonus_minutes").default(0),
  monthlyResetDate: timestamp("monthly_reset_date").defaultNow(),
  weeklyVoiceMinutesUsed: integer("weekly_voice_minutes_used").default(0),
  weeklyResetDate: timestamp("weekly_reset_date").defaultNow(),
  preferredLanguage: text("preferred_language").$type<'en' | 'es' | 'hi' | 'zh' | 'fr' | 'de' | 'pt' | 'ja' | 'sw' | 'af' | 'ha' | 'am'>(), // No default - allows auto-detection
  voiceStyle: text("voice_style").default('cheerful'),
  speechSpeed: decimal("speech_speed").default('1.0'),
  volumeLevel: integer("volume_level").default(75),
  isAdmin: boolean("is_admin").default(false),
  // User Preferences (NULLABLE - safe for existing records)
  interfaceLanguage: varchar("interface_language", { length: 10 }),
  voiceLanguage: varchar("voice_language", { length: 10 }),
  emailNotifications: boolean("email_notifications"),
  marketingEmails: boolean("marketing_emails"),
  // Email Summary Preferences (off, per_session, daily, weekly)
  emailSummaryFrequency: varchar("email_summary_frequency", { length: 20 }).default('daily'),
  // Transcript email - separate delivery address for session/digest emails (does NOT affect login)
  transcriptEmail: text("transcript_email"),
  // Additional email addresses for receiving session summaries (up to 3)
  additionalEmails: text("additional_emails").array(),
  // Email verification fields
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  lastVerificationEmailSentAt: timestamp("last_verification_email_sent_at"),
  // Password reset fields
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  // Security questions for account recovery
  securityQuestion1: text("security_question_1"),
  securityAnswer1: text("security_answer_1"),
  securityQuestion2: text("security_question_2"),
  securityAnswer2: text("security_answer_2"),
  securityQuestion3: text("security_question_3"),
  securityAnswer3: text("security_answer_3"),
  securityQuestionsSet: boolean("security_questions_set").default(false),
  // Security verification token (for email change, etc.)
  securityVerificationToken: text("security_verification_token"),
  securityVerificationExpiry: timestamp("security_verification_expiry"),
  // 30-Minute Free Trial System (account-based)
  trialActive: boolean("is_trial_active").default(false),
  trialMinutesLimit: integer("trial_minutes_limit").default(30),
  trialMinutesUsed: integer("trial_minutes_used").default(0),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialDeviceHash: varchar("trial_device_hash", { length: 64 }),
  trialIpHash: varchar("trial_ip_hash", { length: 64 }),
  firstLoginAt: timestamp("first_login_at"),
  // Admin Account Management Fields
  isDisabled: boolean("is_disabled").default(false),
  disabledAt: timestamp("disabled_at"),
  disabledByAdminId: varchar("disabled_by_admin_id").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  deletedByAdminId: varchar("deleted_by_admin_id").references(() => users.id),
  deletedReason: text("deleted_reason"),
  canceledAt: timestamp("canceled_at"),
  canceledByAdminId: varchar("canceled_by_admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subjects table
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  iconColor: text("icon_color").default('blue'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lessons table
export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey(),
  subjectId: varchar("subject_id").notNull().references(() => subjects.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(),
  practiceProblems: text("practice_problems"),
  answerKey: text("answer_key"),
  orderIndex: integer("order_index").notNull(),
  estimatedMinutes: integer("estimated_minutes").default(15),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// User progress table
export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  status: text("status").$type<'not_started' | 'in_progress' | 'completed' | 'mastered'>().default('not_started'),
  progressPercentage: integer("progress_percentage").default(0),
  quizScore: integer("quiz_score"),
  timeSpent: integer("time_spent").default(0), // in minutes
  lastAccessed: timestamp("last_accessed").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Learning sessions table
export const learningSessions = pgTable("learning_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  sessionType: text("session_type").$type<'voice' | 'text' | 'quiz'>().notNull(),
  transcript: text("transcript"),
  voiceMinutesUsed: integer("voice_minutes_used").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quiz attempts table
export const quizAttempts = pgTable("quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  sessionId: varchar("session_id").references(() => learningSessions.id),
  answers: jsonb("answers").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  timeSpent: integer("time_spent"), // in seconds
  completedAt: timestamp("completed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Usage logs table for tracking voice minutes per session
export const usageLogs = pgTable("usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id").references(() => learningSessions.id),
  minutesUsed: integer("minutes_used").notNull(),
  sessionType: text("session_type").$type<'voice' | 'text'>().notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin audit log table for tracking admin actions
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").$type<'user' | 'subscription' | 'document' | 'agent' | 'system'>().notNull(),
  targetId: text("target_id"),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Marketing campaign tracking table
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  campaignName: text("campaign_name").notNull(),
  segment: text("segment").notNull(), // 'all', 'free-users', 'cancelled', etc.
  contactCount: integer("contact_count").notNull(),
  filters: jsonb("filters"), // Store custom filter criteria
  exportedAt: timestamp("exported_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_campaigns_admin").on(table.adminId),
  index("idx_campaigns_exported").on(table.exportedAt),
]);

// Minute purchases tracking table for hybrid rollover policy
export const minutePurchases = pgTable("minute_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  minutesPurchased: integer("minutes_purchased").notNull(),
  minutesRemaining: integer("minutes_remaining").notNull(),
  pricePaid: decimal("price_paid", { precision: 10, scale: 2 }),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // NULL = never expires
  status: text("status").$type<'active' | 'used' | 'expired'>().default('active'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_minute_purchases_user").on(table.userId, table.status),
]);

// Content violations table for tracking inappropriate behavior
export const contentViolations = pgTable("content_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id"),
  violationType: text("violation_type").$type<'profanity' | 'sexual' | 'harmful' | 'hate' | 'other' | 'self_harm' | 'violent_threat' | 'harm_to_others'>().notNull(),
  severity: text("severity").$type<'low' | 'medium' | 'high' | 'critical'>().notNull(),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  reviewStatus: text("review_status").$type<'pending' | 'reviewed' | 'dismissed'>().default('pending'),
  actionTaken: text("action_taken").$type<'warning' | 'suspension' | 'session_terminated' | 'ban' | 'none'>(),
  notifiedParent: boolean("notified_parent").default(false),
  notifiedSupport: boolean("notified_support").default(false),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_violations_user").on(table.userId),
  index("idx_violations_status").on(table.reviewStatus),
  index("idx_violations_created").on(table.createdAt),
]);

// User suspensions table for tracking banned/suspended users
export const userSuspensions = pgTable("user_suspensions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  violationIds: text("violation_ids").array(), // Array of violation IDs that led to suspension
  suspendedUntil: timestamp("suspended_until"),
  isPermanent: boolean("is_permanent").default(false),
  suspendedBy: varchar("suspended_by").references(() => users.id), // Admin who suspended
  isActive: boolean("is_active").default(true), // Can be lifted early
  liftedAt: timestamp("lifted_at"),
  liftedBy: varchar("lifted_by").references(() => users.id),
  liftReason: text("lift_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_suspensions_user").on(table.userId),
  index("idx_suspensions_active").on(table.isActive),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  progress: many(userProgress),
  sessions: many(learningSessions),
  quizAttempts: many(quizAttempts),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [lessons.subjectId],
    references: [subjects.id],
  }),
  progress: many(userProgress),
  sessions: many(learningSessions),
  quizAttempts: many(quizAttempts),
}));

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, {
    fields: [userProgress.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [userProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const learningSessionsRelations = relations(learningSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [learningSessions.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [learningSessions.lessonId],
    references: [lessons.id],
  }),
  quizAttempts: many(quizAttempts),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [quizAttempts.lessonId],
    references: [lessons.id],
  }),
  session: one(learningSessions, {
    fields: [quizAttempts.sessionId],
    references: [learningSessions.id],
  }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  user: one(users, {
    fields: [usageLogs.userId],
    references: [users.id],
  }),
  session: one(learningSessions, {
    fields: [usageLogs.sessionId],
    references: [learningSessions.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  weeklyVoiceMinutesUsed: true,
  weeklyResetDate: true,
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  createdAt: true,
});

export const insertLessonSchema = createInsertSchema(lessons).omit({
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLearningSessionSchema = createInsertSchema(learningSessions).omit({
  id: true,
  createdAt: true,
});

export const insertQuizAttemptSchema = createInsertSchema(quizAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).omit({
  id: true,
  createdAt: true,
  timestamp: true,
});

// Document management tables
export const userDocuments = pgTable("user_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  originalName: text("original_name").notNull(),
  fileName: text("file_name").notNull(), // stored file name
  filePath: text("file_path").notNull(), // path on disk
  fileType: text("file_type").notNull(), // pdf, docx, etc
  fileSize: integer("file_size").notNull(), // bytes
  subject: text("subject"), // math, english, spanish
  grade: text("grade"), // k-2, 3-5, etc
  title: text("title"), // user-provided title
  description: text("description"), // user description
  language: text("language").default('en'), // document language for OCR (25 languages supported)
  processingStatus: text("processing_status").$type<'queued' | 'processing' | 'ready' | 'failed'>().default('queued'),
  processingError: text("processing_error"),
  retryCount: integer("retry_count").default(0),
  nextRetryAt: timestamp("next_retry_at"),
  parsedTextPath: text("parsed_text_path"), // path to extracted plain text file
  expiresAt: timestamp("expires_at"), // auto-delete after 6 months
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_docs_status").on(table.processingStatus),
  index("idx_user_docs_retry").on(table.nextRetryAt),
  index("idx_user_docs_expires").on(table.expiresAt), // for cleanup queries
]);

export const documentChunks = pgTable("document_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => userDocuments.id, { onDelete: 'cascade' }),
  chunkIndex: integer("chunk_index").notNull(), // order within document
  content: text("content").notNull(), // actual text content
  tokenCount: integer("token_count"), // estimated tokens
  metadata: jsonb("metadata"), // page number, section, etc
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_chunks_document_index").on(table.documentId, table.chunkIndex),
]);

export const documentEmbeddings = pgTable("document_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chunkId: varchar("chunk_id").notNull().references(() => documentChunks.id, { onDelete: 'cascade' }),
  embedding: vector("embedding").notNull(), // pgvector embedding (1536 dimensions)
  embeddingModel: text("embedding_model").default('text-embedding-3-small'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_embeddings_chunk_unique").on(table.chunkId),
  // HNSW index for fast cosine similarity search
  index("idx_embeddings_hnsw").using("hnsw", table.embedding.asc().op("vector_cosine_ops")),
]);

// Update learning sessions to include document context
export const updatedLearningSessions = pgTable("learning_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").references(() => lessons.id),
  sessionType: text("session_type").$type<'voice' | 'text' | 'quiz'>().notNull(),
  contextDocuments: jsonb("context_documents"), // array of doc IDs used
  transcript: text("transcript"),
  voiceMinutesUsed: integer("voice_minutes_used").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document relations
export const userDocumentsRelations = relations(userDocuments, ({ one, many }) => ({
  user: one(users, {
    fields: [userDocuments.userId],
    references: [users.id],
  }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one, many }) => ({
  document: one(userDocuments, {
    fields: [documentChunks.documentId],
    references: [userDocuments.id],
  }),
  embeddings: many(documentEmbeddings),
}));

export const documentEmbeddingsRelations = relations(documentEmbeddings, ({ one }) => ({
  chunk: one(documentChunks, {
    fields: [documentEmbeddings.chunkId],
    references: [documentChunks.id],
  }),
}));

// Insert schemas for new tables
export const insertUserDocumentSchema = createInsertSchema(userDocuments).omit({
  id: true,
  userId: true, // userId passed separately to uploadDocument()
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentEmbeddingSchema = createInsertSchema(documentEmbeddings).omit({
  id: true,
  createdAt: true,
});

// Student Memory Tables
export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: varchar("owner_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  gradeBand: text("grade_band").notNull(), // 'k-2', '3-5', '6-8', '9-12', 'college'
  pace: text("pace").$type<'slow' | 'normal' | 'fast'>().default('normal'),
  encouragement: text("encouragement").$type<'low' | 'medium' | 'high'>().default('medium'),
  goals: text("goals").array().default(sql`ARRAY[]::text[]`), // learning goals as array
  avatarUrl: text("avatar_url"), // URL to uploaded image or preset avatar
  avatarType: text("avatar_type").$type<'default' | 'upload' | 'preset'>().default('default'),
  age: integer("age"), // Student's age (optional)
  lastSessionAt: timestamp("last_session_at"), // Last tutoring session timestamp
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_students_owner").on(table.ownerUserId),
]);

export const studentDocPins = pgTable("student_doc_pins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => students.id, { onDelete: 'cascade' }),
  docId: varchar("doc_id").notNull().references(() => userDocuments.id, { onDelete: 'cascade' }),
  pinnedAt: timestamp("pinned_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_student_doc_unique").on(table.studentId, table.docId),
  index("idx_student_pins").on(table.studentId),
]);

export const tutorSessions = pgTable("tutor_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => students.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  subject: text("subject"), // math, english, spanish
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  minutesUsed: integer("minutes_used").default(0),
  summary: text("summary"), // what was taught
  misconceptions: text("misconceptions"), // what student struggled with
  nextSteps: text("next_steps"), // recommended next actions
  contextDocuments: jsonb("context_documents"), // array of doc IDs used in this session
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tutor_sessions_student").on(table.studentId),
  index("idx_tutor_sessions_user").on(table.userId),
  index("idx_tutor_sessions_latest").on(table.studentId, table.startedAt),
]);

// Dynamic agent sessions (for ElevenLabs agent creation)
export const agentSessions = pgTable("agent_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  studentId: varchar("student_id"), // Optional: reference to student profile
  agentId: text("agent_id"), // ElevenLabs agent ID (NULL until agent is created)
  conversationId: text("conversation_id"),
  baseAgentId: text("base_agent_id"), // Template agent ID used for creation
  knowledgeBaseId: text("knowledge_base_id"),
  studentName: text("student_name").notNull(),
  gradeBand: text("grade_band").notNull(), // 'K-2', '3-5', '6-8', '9-12', 'College/Adult'
  subject: text("subject").notNull(),
  documentIds: text("document_ids").array(), // user doc IDs
  fileIds: text("file_ids").array(), // ElevenLabs KB doc IDs
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("idx_agent_sessions_user").on(table.userId),
  index("idx_agent_sessions_agent").on(table.agentId),
  index("idx_agent_sessions_expires").on(table.expiresAt),
]);

// Student relations
export const studentsRelations = relations(students, ({ one, many }) => ({
  owner: one(users, {
    fields: [students.ownerUserId],
    references: [users.id],
  }),
  pinnedDocs: many(studentDocPins),
  sessions: many(tutorSessions),
}));

export const studentDocPinsRelations = relations(studentDocPins, ({ one }) => ({
  student: one(students, {
    fields: [studentDocPins.studentId],
    references: [students.id],
  }),
  document: one(userDocuments, {
    fields: [studentDocPins.docId],
    references: [userDocuments.id],
  }),
}));

export const tutorSessionsRelations = relations(tutorSessions, ({ one }) => ({
  student: one(students, {
    fields: [tutorSessions.studentId],
    references: [students.id],
  }),
  user: one(users, {
    fields: [tutorSessions.userId],
    references: [users.id],
  }),
}));

// Insert schemas for student memory
export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStudentDocPinSchema = createInsertSchema(studentDocPins).omit({
  id: true,
  pinnedAt: true,
});

export const insertTutorSessionSchema = createInsertSchema(tutorSessions).omit({
  id: true,
  createdAt: true,
});

export const insertAgentSessionSchema = createInsertSchema(agentSessions).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type LearningSession = typeof learningSessions.$inferSelect;
export type InsertLearningSession = z.infer<typeof insertLearningSessionSchema>;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;

// Realtime sessions table (for OpenAI Realtime API WebSocket sessions)
export const realtimeSessions = pgTable("realtime_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  studentId: varchar("student_id").references(() => students.id, { onDelete: 'set null' }),
  studentName: text("student_name"),
  subject: text("subject"),
  language: text("language").default('en').$type<'en' | 'es' | 'hi' | 'zh' | 'fr' | 'de' | 'pt' | 'ja' | 'sw' | 'af' | 'ha' | 'am'>(),
  ageGroup: text("age_group").default('3-5').$type<'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult'>(),
  voice: text("voice"),
  model: text("model").default('gpt-4o-realtime-preview-2024-10-01'),
  status: text("status").default('connecting').$type<'connecting' | 'active' | 'ended' | 'error'>(),
  transcript: jsonb("transcript").$type<Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
    messageId: string;
  }>>().default(sql`'[]'::jsonb`),
  summary: text("summary"),
  totalMessages: integer("total_messages").default(0),
  aiCost: decimal("ai_cost", { precision: 10, scale: 4 }).default("0"),
  audioUrl: text("audio_url"),
  contextDocuments: jsonb("context_documents"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  minutesUsed: integer("minutes_used").default(0),
  errorMessage: text("error_message"),
  safetyFlags: jsonb("safety_flags").$type<Array<{
    type: string;
    timestamp: string;
    messageIndex?: number;
    triggerText?: string;
    tutorResponse?: string;
    severity: 'info' | 'warning' | 'alert' | 'critical';
  }>>().default(sql`'[]'::jsonb`),
  strikeCount: integer("strike_count").default(0),
  terminatedForSafety: boolean("terminated_for_safety").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // Session close reason telemetry (updated enum per spec)
  closeReason: text("close_reason").$type<'user_end' | 'minutes_exhausted' | 'inactivity_timeout' | 'websocket_disconnect' | 'disconnect_timeout' | 'client_unload' | 'server_shutdown' | 'server_error' | null>(),
  closeDetails: jsonb("close_details").$type<{
    wsCloseCode?: number;
    wsCloseReason?: string;
    triggeredBy?: 'client' | 'server';
    lastHeartbeatAt?: string;
    minutesAtClose?: number;
    clientIntent?: string;
    reconnectCount?: number;
    lastClientVisibility?: 'visible' | 'hidden';
  } | null>(),
  // Reconnect tracking columns
  reconnectCount: integer("reconnect_count").default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
}, (table) => [
  index("idx_realtime_sessions_user").on(table.userId),
  index("idx_realtime_sessions_student").on(table.studentId),
  index("idx_realtime_sessions_status").on(table.status),
  index("idx_sessions_user_started").on(table.userId, table.startedAt),
]);

export const insertRealtimeSessionSchema = createInsertSchema(realtimeSessions).omit({
  id: true,
  createdAt: true,
});

// New document types
export type UserDocument = typeof userDocuments.$inferSelect;
export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type InsertDocumentEmbedding = z.infer<typeof insertDocumentEmbeddingSchema>;

// Student memory types
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type StudentDocPin = typeof studentDocPins.$inferSelect;
export type InsertStudentDocPin = z.infer<typeof insertStudentDocPinSchema>;
export type TutorSession = typeof tutorSessions.$inferSelect;
export type InsertTutorSession = z.infer<typeof insertTutorSessionSchema>;

// Admin log types
export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({
  id: true,
  createdAt: true,
  timestamp: true,
});
export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;

// Marketing campaign types
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({
  id: true,
  createdAt: true,
  exportedAt: true,
});
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

// Realtime session types
export type RealtimeSession = typeof realtimeSessions.$inferSelect;
export type InsertRealtimeSession = z.infer<typeof insertRealtimeSessionSchema>;

// Practice Lessons table - stores pre-written curriculum lessons
export const practiceLessons = pgTable("practice_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grade: varchar("grade", { length: 10 }).notNull(), // 'K', '1', '2', etc.
  subject: varchar("subject", { length: 50 }).notNull(), // 'Math', 'ELA', 'Spanish'
  topic: varchar("topic", { length: 100 }).notNull(), // 'Counting', 'Shapes', etc.
  lessonTitle: varchar("lesson_title", { length: 200 }).notNull(),
  learningGoal: text("learning_goal").notNull(),
  tutorIntroduction: text("tutor_introduction").notNull(),
  guidedQuestions: jsonb("guided_questions").notNull().$type<string[]>(),
  practicePrompts: jsonb("practice_prompts").notNull().$type<string[]>(),
  checkUnderstanding: text("check_understanding").notNull(),
  encouragementClose: text("encouragement_close").notNull(),
  difficultyLevel: integer("difficulty_level").default(1),
  estimatedMinutes: integer("estimated_minutes").default(10),
  orderIndex: integer("order_index").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_lessons_grade").on(table.grade),
  index("idx_lessons_subject").on(table.subject),
  index("idx_lessons_topic").on(table.topic),
  uniqueIndex("idx_lessons_unique").on(table.grade, table.subject, table.topic, table.orderIndex),
]);

export const insertPracticeLessonSchema = createInsertSchema(practiceLessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Student Lesson Progress - tracks which lessons students have started/completed
export const studentLessonProgress = pgTable("student_lesson_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => students.id, { onDelete: 'cascade' }),
  lessonId: varchar("lesson_id").notNull().references(() => practiceLessons.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 20 }).default('not_started').$type<'not_started' | 'in_progress' | 'completed'>(),
  sessionId: varchar("session_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  timeSpentSeconds: integer("time_spent_seconds").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_progress_student").on(table.studentId),
  index("idx_progress_status").on(table.status),
  uniqueIndex("idx_progress_unique").on(table.studentId, table.lessonId),
]);

export const insertStudentLessonProgressSchema = createInsertSchema(studentLessonProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Practice Lessons types
export type PracticeLesson = typeof practiceLessons.$inferSelect;
export type InsertPracticeLesson = z.infer<typeof insertPracticeLessonSchema>;
export type StudentLessonProgress = typeof studentLessonProgress.$inferSelect;
export type InsertStudentLessonProgress = z.infer<typeof insertStudentLessonProgressSchema>;

// Trial Sessions table - for 5-minute free trial (completely separate from users)
export const trialSessions = pgTable("trial_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailHash: varchar("email_hash", { length: 64 }).notNull(),
  email: text("email"),
  verificationToken: varchar("verification_token", { length: 64 }),
  verificationExpiry: timestamp("verification_expiry"),
  verifiedAt: timestamp("verified_at"),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialGraceAppliedAt: timestamp("trial_grace_applied_at"),
  usedSeconds: integer("used_seconds").default(0), // Actual tutoring seconds consumed
  consumedSeconds: integer("consumed_seconds").default(0),
  status: varchar("status", { length: 20 }).default('pending').$type<'pending' | 'active' | 'expired' | 'blocked' | 'ended'>(),
  deviceIdHash: varchar("device_id_hash", { length: 64 }),
  ipHash: varchar("ip_hash", { length: 64 }),
  lastActiveAt: timestamp("last_active_at"),
  lastVerificationReminderAt: timestamp("last_verification_reminder_at"),
  verificationReminderCount: integer("verification_reminder_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_trial_email_hash").on(table.emailHash),
  index("idx_trial_device_hash").on(table.deviceIdHash),
  index("idx_trial_status").on(table.status),
  index("idx_trial_verification_token").on(table.verificationToken),
]);

export const insertTrialSessionSchema = createInsertSchema(trialSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Trial rate limiting table - tracks IP-based rate limits
export const trialRateLimits = pgTable("trial_rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  attemptCount: integer("attempt_count").default(1),
  windowStart: timestamp("window_start").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_rate_limit_ip").on(table.ipHash),
]);

// Trial Session types
export type TrialSession = typeof trialSessions.$inferSelect;
export type InsertTrialSession = z.infer<typeof insertTrialSessionSchema>;
export type TrialRateLimit = typeof trialRateLimits.$inferSelect;

// Account-based trial abuse tracking (for 30-minute real trials)
export const trialAbuseTracking = pgTable("trial_abuse_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceHash: text("device_hash"),
  ipHash: text("ip_hash"),  // Nullable — device-only tracking records insert null for ipHash
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  trialCount: integer("trial_count").notNull().default(0),
  lastTrialAt: timestamp("last_trial_at"),
  weekStart: date("week_start").notNull().default(sql`date_trunc('week', now())::date`),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  // Basic lookup indexes
  index("idx_trial_abuse_device").on(table.deviceHash),
  index("idx_trial_abuse_ip").on(table.ipHash),
  // UNIQUE constraint for UPSERT operations (ip_hash + week_start)
  uniqueIndex("idx_trial_abuse_ip_week").on(table.ipHash, table.weekStart),
  // Performance indexes
  index("idx_trial_abuse_ip_recent").on(table.ipHash, table.lastTrialAt),
  index("idx_trial_abuse_week_start").on(table.weekStart),
  index("idx_trial_abuse_user_id").on(table.userId),
]);

export type TrialAbuseTracking = typeof trialAbuseTracking.$inferSelect;

// Trial Login Tokens table - for "Continue Trial" magic links (separate from verification tokens)
export const trialLoginTokens = pgTable("trial_login_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trialSessionId: varchar("trial_session_id", { length: 36 }).notNull().references(() => trialSessions.id, { onDelete: 'cascade' }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_trial_login_token_hash").on(table.tokenHash),
  index("idx_trial_login_session").on(table.trialSessionId),
]);

export const insertTrialLoginTokenSchema = createInsertSchema(trialLoginTokens).omit({
  id: true,
  createdAt: true,
});

// Trial Login Token types
export type TrialLoginToken = typeof trialLoginTokens.$inferSelect;
export type InsertTrialLoginToken = z.infer<typeof insertTrialLoginTokenSchema>;

// Safety incidents table - tracks all safety-related incidents
export const safetyIncidents = pgTable("safety_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => realtimeSessions.id, { onDelete: 'cascade' }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: 'set null' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  flagType: varchar("flag_type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().$type<'info' | 'warning' | 'alert' | 'critical'>(),
  triggerText: text("trigger_text"),
  tutorResponse: text("tutor_response"),
  actionTaken: varchar("action_taken", { length: 50 }),
  adminNotified: boolean("admin_notified").default(false),
  parentNotified: boolean("parent_notified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_safety_incidents_user").on(table.userId),
  index("idx_safety_incidents_session").on(table.sessionId),
  index("idx_safety_incidents_type").on(table.flagType),
  index("idx_safety_incidents_severity").on(table.severity),
]);

export const insertSafetyIncidentSchema = createInsertSchema(safetyIncidents).omit({
  id: true,
  createdAt: true,
});

// Safety Incident types
export type SafetyIncident = typeof safetyIncidents.$inferSelect;
export type InsertSafetyIncident = z.infer<typeof insertSafetyIncidentSchema>;

// Page Views table - passive analytics tracking (additive only)
export const pageViews = pgTable("page_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pagePath: text("page_path").notNull(),
  pageTitle: text("page_title"),
  sessionId: text("session_id"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_page_views_created_at").on(table.createdAt),
  index("idx_page_views_page_path").on(table.pagePath),
]);

export const insertPageViewSchema = createInsertSchema(pageViews).omit({
  id: true,
  createdAt: true,
});

// Page View types
export type PageView = typeof pageViews.$inferSelect;
export type InsertPageView = z.infer<typeof insertPageViewSchema>;

// Digest tracking table - prevents double-sending of daily/weekly digests
export const digestTracking = pgTable("digest_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  digestType: varchar("digest_type", { length: 20 }).notNull().$type<'daily' | 'weekly'>(),
  digestDate: date("digest_date").notNull(),
  sessionCount: integer("session_count").notNull(),
  emailSentAt: timestamp("email_sent_at").defaultNow(),
}, (table) => [
  index("idx_digest_tracking_user").on(table.userId),
  index("idx_digest_tracking_date").on(table.digestDate),
  uniqueIndex("idx_digest_tracking_unique").on(table.userId, table.digestType, table.digestDate),
]);

export const insertDigestTrackingSchema = createInsertSchema(digestTracking).omit({
  id: true,
  emailSentAt: true,
});

// Digest Tracking types
export type DigestTracking = typeof digestTracking.$inferSelect;
export type InsertDigestTracking = z.infer<typeof insertDigestTrackingSchema>;

// Session Summaries table - stores AI-generated session summaries for continuity memory
export const sessionSummaries = pgTable("session_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: 'set null' }),
  sessionId: varchar("session_id").notNull().references(() => realtimeSessions.id, { onDelete: 'cascade' }),
  summaryText: text("summary_text").notNull(),
  topicsCovered: text("topics_covered").array().notNull().default(sql`'{}'::text[]`),
  conceptsMastered: text("concepts_mastered").array(),
  conceptsStruggled: text("concepts_struggled").array(),
  studentInsights: text("student_insights"),
  subject: varchar("subject", { length: 100 }),
  gradeBand: varchar("grade_band", { length: 50 }),
  durationMinutes: integer("duration_minutes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_session_summaries_user_date").on(table.userId, table.createdAt),
  index("idx_session_summaries_student_date").on(table.studentId, table.createdAt),
  uniqueIndex("idx_session_summaries_session").on(table.sessionId),
]);

export const insertSessionSummarySchema = createInsertSchema(sessionSummaries).omit({
  id: true,
  createdAt: true,
});

export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type InsertSessionSummary = z.infer<typeof insertSessionSummarySchema>;

// Memory Jobs table - simple DB queue for async summary generation
export const memoryJobs = pgTable("memory_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: 'set null' }),
  sessionId: varchar("session_id").notNull().references(() => realtimeSessions.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 20 }).notNull().default('pending').$type<'pending' | 'processing' | 'done' | 'error'>(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  runAfter: timestamp("run_after").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_memory_jobs_status_runafter").on(table.status, table.runAfter, table.createdAt),
]);

export const insertMemoryJobSchema = createInsertSchema(memoryJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MemoryJob = typeof memoryJobs.$inferSelect;
export type InsertMemoryJob = z.infer<typeof insertMemoryJobSchema>;

export const verificationReminderTracking = pgTable("verification_reminder_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reminderDate: date("reminder_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_verification_reminder_user").on(table.userId),
  uniqueIndex("idx_verification_reminder_unique").on(table.userId, table.reminderDate),
]);

export type VerificationReminderTracking = typeof verificationReminderTracking.$inferSelect;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Study Guide Library — JIE-provided study materials
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const studyGuides = pgTable("study_guides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'college_coursework', 'test_prep', 'professional_cert', 'k12'
  subcategory: text("subcategory"), // 'LSAT', 'CPA', 'Organic Chemistry', etc.
  gradeBands: jsonb("grade_bands").$type<string[]>().notNull(), // ['College/Adult', '9-12']
  subject: text("subject"), // Maps to session subject for auto-suggest
  contentText: text("content_text").notNull(), // The actual guide content (pre-written text)
  contentTokens: integer("content_tokens"), // Estimated token count
  fileType: text("file_type").default('guide'), // 'guide' for text-based, 'pdf' if file-backed
  filePath: text("file_path"), // Optional: path to downloadable file
  iconEmoji: text("icon_emoji").default('📘'),
  sortOrder: integer("sort_order").default(0),
  isPublished: boolean("is_published").default(true),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_study_guides_category").on(table.category),
  index("idx_study_guides_published").on(table.isPublished),
]);

export const insertStudyGuideSchema = createInsertSchema(studyGuides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type StudyGuide = typeof studyGuides.$inferSelect;
export type InsertStudyGuide = z.infer<typeof insertStudyGuideSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Capital CRM — Funding Pipeline Tracker (Admin Only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ============ CAPITAL OPPORTUNITIES ============
export const capitalOpportunities = pgTable("capital_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fundingSource: text("funding_source").notNull(),
  programName: text("program_name"),
  fundingCategory: text("funding_category").notNull(), // Government Grant, Foundation, Accelerator, Venture Capital, Strategic Partner, Loan/Debt, Competition, Fellowship
  capitalType: text("capital_type").notNull(), // Non-dilutive, Dilutive, Debt, Hybrid
  geography: text("geography").default("National"), // National, Illinois, Chicago, Midwest, Other
  website: text("website"),
  applicationUrl: text("application_url"),
  description: text("description"),
  strategicFitNotes: text("strategic_fit_notes"),
  // Financial
  minAmount: decimal("min_amount"),
  maxAmount: decimal("max_amount"),
  expectedAmount: decimal("expected_amount"),
  probabilityToClose: integer("probability_to_close").default(0), // 0-100
  useOfFunds: text("use_of_funds"),
  matchRequirement: text("match_requirement"),
  equityRequired: boolean("equity_required").default(false),
  repaymentRequired: boolean("repayment_required").default(false),
  // Timing
  openDate: text("open_date"),
  deadlineDate: text("deadline_date"),
  estimatedDecisionDate: text("estimated_decision_date"),
  nextFollowUpDate: text("next_follow_up_date"),
  submissionDate: text("submission_date"),
  meetingDate: text("meeting_date"),
  lastContactDate: text("last_contact_date"),
  // Stage
  stage: text("stage").notNull().default("Identified"),
  // Scoring
  strategicFitScore: integer("strategic_fit_score").default(5),
  speedScore: integer("speed_score").default(5),
  probabilityScore: integer("probability_score").default(5),
  effortScore: integer("effort_score").default(5),
  amountScore: integer("amount_score").default(5),
  weightedScore: decimal("weighted_score").default("5.0"),
  priorityTier: text("priority_tier").default("Tier 2 Near-Term"),
  eligible30_60: boolean("eligible_30_60").default(false),
  warmIntroAvailable: boolean("warm_intro_available").default(false),
  requiresResearchPartner: boolean("requires_research_partner").default(false),
  requiresPilotData: boolean("requires_pilot_data").default(false),
  // Meta
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  founderNotes: text("founder_notes"),
  healthStatus: text("health_status").default("Healthy"), // Healthy, At Risk, Stalled, Closed
  nextAction: text("next_action"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_capital_opps_stage").on(table.stage),
  index("idx_capital_opps_category").on(table.fundingCategory),
  index("idx_capital_opps_health").on(table.healthStatus),
  index("idx_capital_opps_priority").on(table.priorityTier),
  index("idx_capital_opps_deadline").on(table.deadlineDate),
]);

export const insertCapitalOpportunitySchema = createInsertSchema(capitalOpportunities).omit({ id: true });
export type InsertCapitalOpportunity = z.infer<typeof insertCapitalOpportunitySchema>;
export type CapitalOpportunity = typeof capitalOpportunities.$inferSelect;

// ============ CAPITAL CONTACTS ============
export const capitalContacts = pgTable("capital_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organization: text("organization"),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  roleInProcess: text("role_in_process"),
  relationshipStrength: text("relationship_strength").default("Cold"), // Warm, Cold, Referral
  notes: text("notes"),
  lastInteraction: text("last_interaction"),
  nextAction: text("next_action"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_capital_contacts_org").on(table.organization),
]);

export const insertCapitalContactSchema = createInsertSchema(capitalContacts).omit({ id: true });
export type InsertCapitalContact = z.infer<typeof insertCapitalContactSchema>;
export type CapitalContact = typeof capitalContacts.$inferSelect;

// ============ CAPITAL CONTACT <-> OPPORTUNITY LINK ============
export const capitalContactOpportunities = pgTable("capital_contact_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => capitalContacts.id, { onDelete: 'cascade' }),
  opportunityId: varchar("opportunity_id").notNull().references(() => capitalOpportunities.id, { onDelete: 'cascade' }),
}, (table) => [
  index("idx_capital_contact_opps_contact").on(table.contactId),
  index("idx_capital_contact_opps_opp").on(table.opportunityId),
]);

// ============ CAPITAL ACTIVITIES ============
export const capitalActivities = pgTable("capital_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").references(() => capitalOpportunities.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => capitalContacts.id, { onDelete: 'set null' }),
  activityType: text("activity_type").notNull(), // Email Sent, Email Received, Call Completed, Meeting Completed, Application Started, etc.
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_capital_activities_opp").on(table.opportunityId),
  index("idx_capital_activities_contact").on(table.contactId),
]);

export const insertCapitalActivitySchema = createInsertSchema(capitalActivities).omit({ id: true });
export type InsertCapitalActivity = z.infer<typeof insertCapitalActivitySchema>;
export type CapitalActivity = typeof capitalActivities.$inferSelect;

// ============ CAPITAL TASKS ============
export const capitalTasks = pgTable("capital_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  opportunityId: varchar("opportunity_id").references(() => capitalOpportunities.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => capitalContacts.id, { onDelete: 'set null' }),
  taskType: text("task_type").default("General"), // General, Follow-Up, Application, Research, Meeting, Document, Outreach
  dueDate: text("due_date"),
  priority: text("priority").default("Medium"), // High, Medium, Low
  status: text("status").default("Pending"), // Pending, In Progress, Completed
  notes: text("notes"),
  completedDate: text("completed_date"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_capital_tasks_opp").on(table.opportunityId),
  index("idx_capital_tasks_status").on(table.status),
  index("idx_capital_tasks_due").on(table.dueDate),
]);

export const insertCapitalTaskSchema = createInsertSchema(capitalTasks).omit({ id: true });
export type InsertCapitalTask = z.infer<typeof insertCapitalTaskSchema>;
export type CapitalTask = typeof capitalTasks.$inferSelect;

// ============ CAPITAL DOCUMENTS ============
export const capitalDocuments = pgTable("capital_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  documentType: text("document_type").notNull(), // Pitch Deck, Executive Summary, One-Pager, Financial Model, Budget, Grant Narrative, etc.
  version: text("version").default("1.0"),
  opportunityId: varchar("opportunity_id").references(() => capitalOpportunities.id, { onDelete: 'set null' }),
  status: text("status").default("Draft"), // Draft, In Review, Final, Submitted
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_capital_docs_opp").on(table.opportunityId),
  index("idx_capital_docs_type").on(table.documentType),
]);

export const insertCapitalDocumentSchema = createInsertSchema(capitalDocuments).omit({ id: true });
export type InsertCapitalDocument = z.infer<typeof insertCapitalDocumentSchema>;
export type CapitalDocument = typeof capitalDocuments.$inferSelect;

// ============ CAPITAL CRM CONSTANTS ============
export const CAPITAL_STAGES = [
  "Identified",
  "Researching",
  "Qualified",
  "Contact Identified",
  "Outreach Drafted",
  "Outreach Sent",
  "Intro Call Scheduled",
  "In Discussion",
  "Application In Progress",
  "Submitted",
  "Follow-Up Pending",
  "Due Diligence",
  "Verbal Interest",
  "Negotiation",
  "Awarded",
  "Closed Lost",
  "Deferred",
] as const;

export const CAPITAL_CLOSED_STAGES = ["Awarded", "Closed Lost", "Deferred"] as const;

export const CAPITAL_FUNDING_CATEGORIES = [
  "Government Grant",
  "Foundation",
  "Accelerator",
  "Venture Capital",
  "Strategic Partner",
  "Loan/Debt",
  "Competition",
  "Fellowship",
] as const;

export const CAPITAL_TYPES = ["Non-dilutive", "Dilutive", "Debt", "Hybrid"] as const;

export const CAPITAL_GEOGRAPHIES = ["National", "Illinois", "Chicago", "Midwest", "Other"] as const;

export const CAPITAL_PRIORITY_TIERS = ["Tier 1 Immediate", "Tier 2 Near-Term", "Tier 3 Later"] as const;

export const CAPITAL_HEALTH_STATUSES = ["Healthy", "At Risk", "Stalled", "Closed"] as const;

export const CAPITAL_TASK_TYPES = [
  "General",
  "Follow-Up",
  "Application",
  "Research",
  "Meeting",
  "Document",
  "Outreach",
] as const;

export const CAPITAL_ACTIVITY_TYPES = [
  "Email Sent",
  "Email Received",
  "Call Completed",
  "Meeting Completed",
  "Application Started",
  "Application Submitted",
  "Document Uploaded",
  "Reminder Set",
  "Internal Note",
  "Follow-up Completed",
  "Status Changed",
  "Stage Changed",
] as const;

export const CAPITAL_DOCUMENT_TYPES = [
  "Pitch Deck",
  "Executive Summary",
  "One-Pager",
  "Financial Model",
  "Budget",
  "Grant Narrative",
  "Letter of Support",
  "Application Draft",
  "Submitted Material",
  "Follow-up Notes",
] as const;

// ============ CAPITAL SCORING UTILITIES ============
export function calculateCapitalWeightedScore(opp: {
  strategicFitScore?: number | null;
  speedScore?: number | null;
  probabilityScore?: number | null;
  amountScore?: number | null;
  effortScore?: number | null;
}): number {
  const strategicFit = opp.strategicFitScore ?? 5;
  const speed = opp.speedScore ?? 5;
  const probability = opp.probabilityScore ?? 5;
  const amount = opp.amountScore ?? 5;
  const effort = opp.effortScore ?? 5;
  return (
    strategicFit * 0.30 +
    speed * 0.25 +
    probability * 0.20 +
    amount * 0.15 +
    (11 - effort) * 0.10
  );
}

export function calculateCapitalPriorityTier(weightedScore: number): string {
  if (weightedScore >= 8.0) return "Tier 1 Immediate";
  if (weightedScore >= 6.5) return "Tier 2 Near-Term";
  return "Tier 3 Later";
}

export function calculateCapitalHealthStatus(opp: {
  stage: string;
  lastContactDate?: string | null;
  nextFollowUpDate?: string | null;
  updatedAt: string;
}): string {
  if (["Awarded", "Closed Lost", "Deferred"].includes(opp.stage)) {
    return "Closed";
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const lastDate = opp.lastContactDate || opp.updatedAt;
  if (lastDate) {
    const last = new Date(lastDate + "T00:00:00");
    const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 14) return "Stalled";
    if (daysSince >= 7) return "At Risk";
  }

  if (opp.nextFollowUpDate) {
    const followUp = new Date(opp.nextFollowUpDate + "T00:00:00");
    if (followUp < now) return "At Risk";
  }

  return "Healthy";
}

// Sales / Prospects CRM — Customer & Institutional Pipeline (Admin Only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const salesProspects = pgTable("sales_prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  institutionName: text("institution_name").notNull(),
  institutionType: text("institution_type").notNull(),
  sector: text("sector"),
  subsector: text("subsector"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  region: text("region"),
  country: text("country").default("USA"),
  estimatedStudents: integer("estimated_students"),
  estimatedStaff: integer("estimated_staff"),
  numberOfSchools: integer("number_of_schools"),
  annualBudget: text("annual_budget"),
  icpFitScore: integer("icp_fit_score"),
  stage: text("stage").notNull().default("Identified"),
  dealSize: decimal("deal_size"),
  probability: integer("probability").default(0),
  weightedValue: decimal("weighted_value"),
  forecastCategory: text("forecast_category").default("Pipeline"),
  closeDate: text("close_date"),
  pilotStartDate: text("pilot_start_date"),
  pilotEndDate: text("pilot_end_date"),
  contractStartDate: text("contract_start_date"),
  contractEndDate: text("contract_end_date"),
  lastActivityDate: text("last_activity_date"),
  nextFollowUpDate: text("next_follow_up_date"),
  nextMeetingDate: text("next_meeting_date"),
  currentSolution: text("current_solution"),
  painPoints: text("pain_points"),
  buyingProcess: text("buying_process"),
  budgetStatus: text("budget_status"),
  decisionTimeline: text("decision_timeline"),
  championIdentified: boolean("champion_identified").default(false),
  pilotRequired: boolean("pilot_required").default(false),
  competitorPresent: text("competitor_present"),
  urgencyScore: integer("urgency_score").default(5),
  engagementScore: integer("engagement_score").default(5),
  fitScore: integer("fit_score").default(5),
  budgetScore: integer("budget_score").default(5),
  authorityScore: integer("authority_score").default(5),
  weightedScore: decimal("weighted_score").default("5.0"),
  priorityTier: text("priority_tier").default("Tier 2"),
  source: text("source"),
  territory: text("territory"),
  ownerId: text("owner_id"),
  healthStatus: text("health_status").default("Healthy"),
  nextAction: text("next_action"),
  strategicNotes: text("strategic_notes"),
  founderNotes: text("founder_notes"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_sales_prospects_stage").on(table.stage),
  index("idx_sales_prospects_type").on(table.institutionType),
  index("idx_sales_prospects_health").on(table.healthStatus),
  index("idx_sales_prospects_priority").on(table.priorityTier),
  index("idx_sales_prospects_region").on(table.region),
  index("idx_sales_prospects_forecast").on(table.forecastCategory),
]);

export const insertSalesProspectSchema = createInsertSchema(salesProspects).omit({ id: true });
export type InsertSalesProspect = z.infer<typeof insertSalesProspectSchema>;
export type SalesProspect = typeof salesProspects.$inferSelect;

export const salesContacts = pgTable("sales_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prospectId: varchar("prospect_id").references(() => salesProspects.id, { onDelete: 'cascade' }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  title: text("title"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  buyingRole: text("buying_role"),
  relationshipStrength: text("relationship_strength").default("Cold"),
  preferredContactMethod: text("preferred_contact_method"),
  lastContactDate: text("last_contact_date"),
  nextContactDate: text("next_contact_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_sales_contacts_prospect").on(table.prospectId),
  index("idx_sales_contacts_role").on(table.buyingRole),
]);

export const insertSalesContactSchema = createInsertSchema(salesContacts).omit({ id: true });
export type InsertSalesContact = z.infer<typeof insertSalesContactSchema>;
export type SalesContact = typeof salesContacts.$inferSelect;

export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prospectId: varchar("prospect_id").references(() => salesProspects.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => salesContacts.id, { onDelete: 'set null' }),
  activityType: text("activity_type").notNull(),
  subject: text("subject"),
  notes: text("notes"),
  outcome: text("outcome"),
  nextAction: text("next_action"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_sales_activities_prospect").on(table.prospectId),
  index("idx_sales_activities_contact").on(table.contactId),
  index("idx_sales_activities_type").on(table.activityType),
]);

export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({ id: true });
export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;
export type SalesActivity = typeof salesActivities.$inferSelect;

export const salesTasks = pgTable("sales_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  prospectId: varchar("prospect_id").references(() => salesProspects.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => salesContacts.id, { onDelete: 'set null' }),
  taskType: text("task_type").default("General"),
  dueDate: text("due_date"),
  priority: text("priority").default("Medium"),
  status: text("status").default("Pending"),
  notes: text("notes"),
  completedDate: text("completed_date"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_sales_tasks_prospect").on(table.prospectId),
  index("idx_sales_tasks_status").on(table.status),
  index("idx_sales_tasks_due").on(table.dueDate),
]);

export const insertSalesTaskSchema = createInsertSchema(salesTasks).omit({ id: true });
export type InsertSalesTask = z.infer<typeof insertSalesTaskSchema>;
export type SalesTask = typeof salesTasks.$inferSelect;

export const salesDocuments = pgTable("sales_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  documentType: text("document_type").notNull(),
  version: text("version").default("1.0"),
  prospectId: varchar("prospect_id").references(() => salesProspects.id, { onDelete: 'set null' }),
  status: text("status").default("Draft"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_sales_docs_prospect").on(table.prospectId),
  index("idx_sales_docs_type").on(table.documentType),
]);

export const insertSalesDocumentSchema = createInsertSchema(salesDocuments).omit({ id: true });
export type InsertSalesDocument = z.infer<typeof insertSalesDocumentSchema>;
export type SalesDocument = typeof salesDocuments.$inferSelect;

export const SALES_STAGES = [
  "Identified", "Researching", "Outreach Sent", "Intro Scheduled",
  "Discovery", "Qualified", "Demo Scheduled", "Demo Completed",
  "Needs Analysis", "Proposal In Progress", "Proposal Sent",
  "Pilot Discussion", "Pilot Active", "Pilot Review",
  "Procurement Review", "Contract Sent", "Contract Review",
  "Verbal Commit", "Closed Won", "Closed Lost", "Nurture / Deferred",
] as const;

export const SALES_CLOSED_STAGES = ["Closed Won", "Closed Lost", "Nurture / Deferred"] as const;

export const SALES_INSTITUTION_TYPES = [
  "K-12 District", "Charter School", "Private School", "University",
  "Community College", "Corporate L&D", "Government Agency",
  "Nonprofit", "Tutoring Company", "Other",
] as const;

export function calculateSalesWeightedScore(prospect: {
  urgencyScore?: number | null;
  engagementScore?: number | null;
  fitScore?: number | null;
  budgetScore?: number | null;
  authorityScore?: number | null;
}): number {
  const urgency = prospect.urgencyScore ?? 5;
  const engagement = prospect.engagementScore ?? 5;
  const fit = prospect.fitScore ?? 5;
  const budget = prospect.budgetScore ?? 5;
  const authority = prospect.authorityScore ?? 5;
  return fit * 0.25 + urgency * 0.25 + engagement * 0.20 + budget * 0.15 + authority * 0.15;
}

export function calculateSalesPriorityTier(weightedScore: number): string {
  if (weightedScore >= 8.0) return "Tier 1";
  if (weightedScore >= 6.0) return "Tier 2";
  return "Tier 3";
}

export function calculateSalesHealthStatus(prospect: {
  stage: string;
  lastActivityDate?: string | null;
  nextFollowUpDate?: string | null;
  updatedAt: string;
}): string {
  if (["Closed Won", "Closed Lost", "Nurture / Deferred"].includes(prospect.stage)) return "Closed";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const lastDate = prospect.lastActivityDate || prospect.updatedAt;
  if (lastDate) {
    const last = new Date(lastDate.includes("T") ? lastDate : lastDate + "T00:00:00");
    const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 14) return "Stalled";
    if (daysSince >= 7) return "At Risk";
  }
  if (prospect.nextFollowUpDate) {
    const followUp = new Date(prospect.nextFollowUpDate.includes("T") ? prospect.nextFollowUpDate : prospect.nextFollowUpDate + "T00:00:00");
    if (followUp < now) return "At Risk";
  }
  return "Healthy";
}

// ============================================================
// Family Academic Command Center Tables (K-12 Consumer Edition)
// ============================================================

// 1. family_children — Child profiles under a parent account
export const familyChildren = pgTable("family_children", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  studentId: varchar("student_id").references(() => students.id, { onDelete: "set null" }),
  childName: text("child_name").notNull(),
  childAge: integer("child_age"),
  gradeLevel: text("grade_level"),
  avatarEmoji: text("avatar_emoji"),
  photoUrl: text("photo_url"),
  color: text("color"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_family_children_parent").on(table.parentUserId),
]);

// 2. family_courses — Classes/subjects per child
export const familyCourses = pgTable("family_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  courseName: text("course_name").notNull(),
  teacherName: text("teacher_name"),
  schoolName: text("school_name"),
  semester: text("semester"),
  scheduleText: text("schedule_text"),
  syllabusText: text("syllabus_text"),
  syllabusUploadedAt: timestamp("syllabus_uploaded_at"),
  color: text("color"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_family_courses_child").on(table.childId),
  index("idx_family_courses_parent").on(table.parentUserId),
]);

// 3. family_calendar_events — Tests, homework, projects per child
export const familyCalendarEvents = pgTable("family_calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  courseId: varchar("course_id").references(() => familyCourses.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  eventType: text("event_type"),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  isFromSchedule: boolean("is_from_schedule").default(false),
  priority: text("priority"),
  status: text("status").default("upcoming"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_events_child").on(table.childId),
  index("idx_family_events_parent").on(table.parentUserId),
  index("idx_family_events_date").on(table.childId, table.startDate),
]);

// 4. family_tasks — Auto-generated + manual study tasks per child
export const familyTasks = pgTable("family_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  courseId: varchar("course_id").references(() => familyCourses.id, { onDelete: "set null" }),
  eventId: varchar("event_id").references(() => familyCalendarEvents.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  taskType: text("task_type"),
  dueDate: date("due_date"),
  priority: text("priority"),
  status: text("status").default("pending"),
  estimatedMinutes: integer("estimated_minutes"),
  actualMinutes: integer("actual_minutes"),
  xpReward: integer("xp_reward").default(10),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_tasks_child").on(table.childId),
  index("idx_family_tasks_parent").on(table.parentUserId),
  index("idx_family_tasks_status").on(table.childId, table.status),
]);

// 5. family_reminders — Notifications for parent + child
export const familyReminders = pgTable("family_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  eventId: varchar("event_id").references(() => familyCalendarEvents.id, { onDelete: "set null" }),
  taskId: varchar("task_id").references(() => familyTasks.id, { onDelete: "set null" }),
  reminderType: text("reminder_type"),
  reminderDate: date("reminder_date"),
  message: text("message"),
  delivered: boolean("delivered").default(false),
  deliveredAt: timestamp("delivered_at"),
  deliveryMethod: text("delivery_method").default("in_app"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_reminders_child").on(table.childId),
  index("idx_family_reminders_date").on(table.reminderDate, table.delivered),
]);

// 6. family_engagement_scores — Weekly engagement per child
export const familyEngagementScores = pgTable("family_engagement_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  courseId: varchar("course_id").references(() => familyCourses.id, { onDelete: "set null" }),
  weekStart: date("week_start"),
  sessionsCompleted: integer("sessions_completed").default(0),
  tasksCompleted: integer("tasks_completed").default(0),
  tasksPending: integer("tasks_pending").default(0),
  tasksMissed: integer("tasks_missed").default(0),
  totalStudyMinutes: integer("total_study_minutes").default(0),
  engagementScore: decimal("engagement_score").default("0"),
  trend: text("trend").default("stable"),
  riskLevel: text("risk_level").default("on_track"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_engagement_child").on(table.childId),
  index("idx_family_engagement_week").on(table.childId, table.weekStart),
]);

// 7. family_study_goals — Parent-set weekly goals per child
export const familyStudyGoals = pgTable("family_study_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  goalType: text("goal_type").notNull(),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_family_goals_child").on(table.childId),
]);

// 8. family_achievements — Badges and milestones per child
export const familyAchievements = pgTable("family_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  achievementType: text("achievement_type").notNull(),
  achievementName: text("achievement_name").notNull(),
  achievementEmoji: text("achievement_emoji"),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (table) => [
  index("idx_family_achievements_child").on(table.childId),
]);

// 9. family_streaks — Daily activity tracking
export const familyStreaks = pgTable("family_streaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  activityDate: date("activity_date").notNull(),
  hadSession: boolean("had_session").default(false),
  hadTaskCompletion: boolean("had_task_completion").default(false),
  studyMinutes: integer("study_minutes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_family_streaks_unique").on(table.childId, table.activityDate),
  index("idx_family_streaks_child").on(table.childId, table.activityDate),
]);

// 10. family_weekly_reports — Cached weekly digest data for parent emails
export const familyWeeklyReports = pgTable("family_weekly_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull().references(() => familyChildren.id, { onDelete: "cascade" }),
  parentUserId: varchar("parent_user_id").notNull().references(() => users.id),
  weekStart: date("week_start"),
  reportData: jsonb("report_data"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_reports_parent").on(table.parentUserId, table.weekStart),
]);

// Family Academic Relations
export const familyChildrenRelations = relations(familyChildren, ({ one, many }) => ({
  parent: one(users, { fields: [familyChildren.parentUserId], references: [users.id] }),
  courses: many(familyCourses),
  events: many(familyCalendarEvents),
  tasks: many(familyTasks),
  reminders: many(familyReminders),
  engagementScores: many(familyEngagementScores),
  goals: many(familyStudyGoals),
  achievements: many(familyAchievements),
  streaks: many(familyStreaks),
  weeklyReports: many(familyWeeklyReports),
}));

export const familyCoursesRelations = relations(familyCourses, ({ one }) => ({
  child: one(familyChildren, { fields: [familyCourses.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyCourses.parentUserId], references: [users.id] }),
}));

export const familyCalendarEventsRelations = relations(familyCalendarEvents, ({ one }) => ({
  child: one(familyChildren, { fields: [familyCalendarEvents.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyCalendarEvents.parentUserId], references: [users.id] }),
  course: one(familyCourses, { fields: [familyCalendarEvents.courseId], references: [familyCourses.id] }),
}));

export const familyTasksRelations = relations(familyTasks, ({ one }) => ({
  child: one(familyChildren, { fields: [familyTasks.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyTasks.parentUserId], references: [users.id] }),
  course: one(familyCourses, { fields: [familyTasks.courseId], references: [familyCourses.id] }),
  event: one(familyCalendarEvents, { fields: [familyTasks.eventId], references: [familyCalendarEvents.id] }),
}));

export const familyRemindersRelations = relations(familyReminders, ({ one }) => ({
  child: one(familyChildren, { fields: [familyReminders.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyReminders.parentUserId], references: [users.id] }),
  event: one(familyCalendarEvents, { fields: [familyReminders.eventId], references: [familyCalendarEvents.id] }),
  task: one(familyTasks, { fields: [familyReminders.taskId], references: [familyTasks.id] }),
}));

export const familyEngagementScoresRelations = relations(familyEngagementScores, ({ one }) => ({
  child: one(familyChildren, { fields: [familyEngagementScores.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyEngagementScores.parentUserId], references: [users.id] }),
  course: one(familyCourses, { fields: [familyEngagementScores.courseId], references: [familyCourses.id] }),
}));

export const familyStudyGoalsRelations = relations(familyStudyGoals, ({ one }) => ({
  child: one(familyChildren, { fields: [familyStudyGoals.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyStudyGoals.parentUserId], references: [users.id] }),
}));

export const familyAchievementsRelations = relations(familyAchievements, ({ one }) => ({
  child: one(familyChildren, { fields: [familyAchievements.childId], references: [familyChildren.id] }),
}));

export const familyStreaksRelations = relations(familyStreaks, ({ one }) => ({
  child: one(familyChildren, { fields: [familyStreaks.childId], references: [familyChildren.id] }),
}));

export const familyWeeklyReportsRelations = relations(familyWeeklyReports, ({ one }) => ({
  child: one(familyChildren, { fields: [familyWeeklyReports.childId], references: [familyChildren.id] }),
  parent: one(users, { fields: [familyWeeklyReports.parentUserId], references: [users.id] }),
}));

// Family Academic Insert Schemas
export const insertFamilyChildSchema = createInsertSchema(familyChildren).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFamilyCourseSchema = createInsertSchema(familyCourses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFamilyCalendarEventSchema = createInsertSchema(familyCalendarEvents).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyTaskSchema = createInsertSchema(familyTasks).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyReminderSchema = createInsertSchema(familyReminders).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyEngagementScoreSchema = createInsertSchema(familyEngagementScores).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyStudyGoalSchema = createInsertSchema(familyStudyGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFamilyAchievementSchema = createInsertSchema(familyAchievements).omit({
  id: true,
  earnedAt: true,
});

export const insertFamilyStreakSchema = createInsertSchema(familyStreaks).omit({
  id: true,
  createdAt: true,
});

export const insertFamilyWeeklyReportSchema = createInsertSchema(familyWeeklyReports).omit({
  id: true,
  createdAt: true,
});

// Family Academic Types
export type FamilyChild = typeof familyChildren.$inferSelect;
export type InsertFamilyChild = z.infer<typeof insertFamilyChildSchema>;
export type FamilyCourse = typeof familyCourses.$inferSelect;
export type InsertFamilyCourse = z.infer<typeof insertFamilyCourseSchema>;
export type FamilyCalendarEvent = typeof familyCalendarEvents.$inferSelect;
export type InsertFamilyCalendarEvent = z.infer<typeof insertFamilyCalendarEventSchema>;
export type FamilyTask = typeof familyTasks.$inferSelect;
export type InsertFamilyTask = z.infer<typeof insertFamilyTaskSchema>;
export type FamilyReminder = typeof familyReminders.$inferSelect;
export type InsertFamilyReminder = z.infer<typeof insertFamilyReminderSchema>;
export type FamilyEngagementScore = typeof familyEngagementScores.$inferSelect;
export type InsertFamilyEngagementScore = z.infer<typeof insertFamilyEngagementScoreSchema>;
export type FamilyStudyGoal = typeof familyStudyGoals.$inferSelect;
export type InsertFamilyStudyGoal = z.infer<typeof insertFamilyStudyGoalSchema>;
export type FamilyAchievement = typeof familyAchievements.$inferSelect;
export type InsertFamilyAchievement = z.infer<typeof insertFamilyAchievementSchema>;
export type FamilyStreak = typeof familyStreaks.$inferSelect;
export type InsertFamilyStreak = z.infer<typeof insertFamilyStreakSchema>;
export type FamilyWeeklyReport = typeof familyWeeklyReports.$inferSelect;
export type InsertFamilyWeeklyReport = z.infer<typeof insertFamilyWeeklyReportSchema>;

// Family XP and Gamification Constants
export const FAMILY_XP = {
  TASK_COMPLETE: 10,
  SESSION_COMPLETE: 25,
  WEEKLY_TASK_BONUS: 50,
  PERFECT_WEEK: 100,
} as const;

export const FAMILY_STREAK_BADGES = [
  { days: 3, name: "On Fire!", emoji: "🔥" },
  { days: 7, name: "Star Learner", emoji: "⭐" },
  { days: 14, name: "Trophy Winner", emoji: "🏆" },
  { days: 30, name: "Royal Scholar", emoji: "👑" },
] as const;

export const FAMILY_ACHIEVEMENTS = [
  { type: "first_session", name: "First Session", emoji: "🎉" },
  { type: "task_machine", name: "Task Machine", emoji: "⚙️", threshold: 50 },
  { type: "streak_master", name: "Streak Master", emoji: "🏅", threshold: 30 },
  { type: "goal_crusher", name: "Goal Crusher", emoji: "💪" },
  { type: "early_bird", name: "Early Bird", emoji: "🌅" },
  { type: "night_owl", name: "Night Owl", emoji: "🦉" },
  { type: "multi_subject_hero", name: "Multi-Subject Hero", emoji: "🦸" },
  { type: "summer_scholar", name: "Summer Scholar", emoji: "☀️" },
] as const;

export function calculateFamilyXpLevel(totalXp: number): number {
  let level = 1;
  let xpNeeded = 100;
  let remaining = totalXp;
  while (remaining >= xpNeeded) {
    remaining -= xpNeeded;
    level++;
    xpNeeded = level * 100;
  }
  return level;
}

export function calculateFamilyEngagement(data: {
  sessionsCompleted: number;
  sessionsTarget: number;
  tasksCompleted: number;
  totalTasks: number;
  studyMinutes: number;
  recommendedMinutes: number;
  activeDays: number;
}): { score: number; riskLevel: string } {
  const sessionPts = data.sessionsTarget > 0
    ? Math.min(40, (data.sessionsCompleted / data.sessionsTarget) * 40)
    : 0;
  const taskPts = data.totalTasks > 0
    ? Math.min(30, (data.tasksCompleted / data.totalTasks) * 30)
    : 0;
  const minutePts = data.recommendedMinutes > 0
    ? Math.min(20, (data.studyMinutes / data.recommendedMinutes) * 20)
    : 0;
  const consistencyPts = data.activeDays >= 4 ? 10 : (data.activeDays / 4) * 10;

  const score = Math.round(sessionPts + taskPts + minutePts + consistencyPts);

  let riskLevel = "on_track";
  if (score < 30) riskLevel = "critical";
  else if (score < 50) riskLevel = "at_risk";
  else if (score < 70) riskLevel = "needs_attention";

  return { score, riskLevel };
}
