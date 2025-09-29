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
  index 
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionPlan: text("subscription_plan").$type<'single' | 'all'>(),
  subscriptionStatus: text("subscription_status").$type<'active' | 'canceled' | 'paused'>(),
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
  processingStatus: text("processing_status").$type<'pending' | 'processing' | 'completed' | 'failed'>().default('pending'),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentChunks = pgTable("document_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => userDocuments.id, { onDelete: 'cascade' }),
  chunkIndex: integer("chunk_index").notNull(), // order within document
  content: text("content").notNull(), // actual text content
  tokenCount: integer("token_count"), // estimated tokens
  metadata: jsonb("metadata"), // page number, section, etc
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentEmbeddings = pgTable("document_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chunkId: varchar("chunk_id").notNull().references(() => documentChunks.id, { onDelete: 'cascade' }),
  embedding: text("embedding").notNull(), // JSON array of floats
  embeddingModel: text("embedding_model").default('text-embedding-ada-002'),
  createdAt: timestamp("created_at").defaultNow(),
});

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

// New document types
export type UserDocument = typeof userDocuments.$inferSelect;
export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type InsertDocumentEmbedding = z.infer<typeof insertDocumentEmbeddingSchema>;
