import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
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
  // Email verification fields
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
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
  violationType: text("violation_type").$type<'profanity' | 'sexual' | 'harmful' | 'hate' | 'other'>().notNull(),
  severity: text("severity").$type<'low' | 'medium' | 'high'>().notNull(),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  reviewStatus: text("review_status").$type<'pending' | 'reviewed' | 'dismissed'>().default('pending'),
  actionTaken: text("action_taken").$type<'warning' | 'suspension' | 'ban' | 'none'>(),
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
  consumedSeconds: integer("consumed_seconds").default(0),
  status: varchar("status", { length: 20 }).default('pending').$type<'pending' | 'active' | 'expired' | 'blocked'>(),
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
