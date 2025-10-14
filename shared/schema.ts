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
  subscriptionPlan: text("subscription_plan").$type<'starter' | 'standard' | 'pro' | 'single' | 'all'>(),
  subscriptionStatus: text("subscription_status").$type<'active' | 'canceled' | 'paused'>(),
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
  preferredLanguage: text("preferred_language").default('english'),
  voiceStyle: text("voice_style").default('cheerful'),
  speechSpeed: decimal("speech_speed").default('1.0'),
  volumeLevel: integer("volume_level").default(75),
  isAdmin: boolean("is_admin").default(false),
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
  keepForFutureSessions: boolean("keep_for_future_sessions").default(false),
  processingStatus: text("processing_status").$type<'queued' | 'processing' | 'ready' | 'failed'>().default('queued'),
  processingError: text("processing_error"),
  retryCount: integer("retry_count").default(0),
  nextRetryAt: timestamp("next_retry_at"),
  parsedTextPath: text("parsed_text_path"), // path to extracted plain text file
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_docs_status").on(table.processingStatus),
  index("idx_user_docs_retry").on(table.nextRetryAt),
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
  subject: text("subject"),
  language: text("language").default('en').$type<'en' | 'es' | 'hi' | 'zh'>(),
  ageGroup: text("age_group").default('3-5').$type<'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult'>(),
  voice: text("voice"),
  model: text("model").default('gpt-4o-realtime-preview-2024-10-01'),
  status: text("status").default('connecting').$type<'connecting' | 'active' | 'ended' | 'error'>(),
  transcript: jsonb("transcript"),
  contextDocuments: jsonb("context_documents"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  minutesUsed: integer("minutes_used").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_realtime_sessions_user").on(table.userId),
  index("idx_realtime_sessions_student").on(table.studentId),
  index("idx_realtime_sessions_status").on(table.status),
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
