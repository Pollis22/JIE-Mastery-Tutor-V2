import {
  users,
  subjects,
  lessons,
  userProgress,
  learningSessions,
  quizAttempts,
  usageLogs,
  userDocuments,
  documentChunks,
  documentEmbeddings,
  students,
  studentDocPins,
  tutorSessions,
  agentSessions,
  adminLogs,
  marketingCampaigns,
  type User,
  type InsertUser,
  type Subject,
  type Lesson,
  type UserProgress,
  type LearningSession,
  type QuizAttempt,
  type InsertLearningSession,
  type InsertQuizAttempt,
  type UserDocument,
  type InsertUserDocument,
  type DocumentChunk,
  type InsertDocumentChunk,
  type DocumentEmbedding,
  type InsertDocumentEmbedding,
  type Student,
  type InsertStudent,
  type StudentDocPin,
  type InsertStudentDocPin,
  type TutorSession,
  type InsertTutorSession,
  type AdminLog,
  type InsertAdminLog,
  type MarketingCampaign,
  type InsertMarketingCampaign,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, count, sum, sql, like, or } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import MemoryStore from "memorystore";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSettings(userId: string, settings: Partial<User>): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string | null): Promise<User>;
  updateUserSubscription(userId: string, plan: 'starter' | 'standard' | 'pro' | 'single' | 'all', status: 'active' | 'canceled' | 'paused', monthlyMinutes?: number): Promise<User>;
  updateUserVoiceUsage(userId: string, minutesUsed: number): Promise<void>;
  resetUserVoiceUsage(userId: string): Promise<void>;
  canUserUseVoice(userId: string): Promise<boolean>;
  getAvailableMinutes(userId: string): Promise<{ total: number; used: number; remaining: number; bonusMinutes: number }>;
  addBonusMinutes(userId: string, minutes: number): Promise<User>;
  updateUserMarketingPreferences(userId: string, optIn: boolean): Promise<User>;
  createUsageLog(userId: string, minutesUsed: number, sessionType: 'voice' | 'text', sessionId?: string): Promise<void>;

  // Dashboard operations
  getUserDashboard(userId: string): Promise<any>;
  getResumeSession(userId: string): Promise<any>;

  // Lesson operations
  getAllSubjects(): Promise<Subject[]>;
  getSubjectLessons(subjectId: string): Promise<Lesson[]>;
  getLessonById(lessonId: string): Promise<Lesson | undefined>;
  getUserProgress(userId: string, lessonId: string): Promise<UserProgress | undefined>;
  updateUserProgress(userId: string, lessonId: string, progress: Partial<UserProgress>): Promise<UserProgress>;

  // Session operations
  createLearningSession(session: InsertLearningSession): Promise<LearningSession>;
  endLearningSession(sessionId: string, userId: string, updates: Partial<LearningSession>): Promise<LearningSession>;
  getUserSessions(userId: string): Promise<LearningSession[]>;

  // Quiz operations
  createQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt>;
  getUserQuizAttempts(userId: string, lessonId?: string): Promise<QuizAttempt[]>;

  // Admin operations
  getAdminUsers(options: { page: number; limit: number; search: string }): Promise<any>;
  getAdminStats(): Promise<any>;
  exportUsersCSV(): Promise<string>;
  
  // Admin audit log operations
  createAdminLog(log: InsertAdminLog): Promise<AdminLog>;
  getAdminLogs(options: { page: number; limit: number; adminId?: string; action?: string }): Promise<{ logs: AdminLog[]; total: number }>;

  // Document operations
  uploadDocument(userId: string, document: InsertUserDocument): Promise<UserDocument>;
  getUserDocuments(userId: string): Promise<UserDocument[]>;
  getDocument(documentId: string, userId: string): Promise<UserDocument | undefined>;
  deleteDocument(documentId: string, userId: string): Promise<void>;
  updateDocument(documentId: string, userId: string, updates: Partial<UserDocument>): Promise<UserDocument>;
  updateDocumentById(documentId: string, updates: Partial<UserDocument>): Promise<UserDocument | null>;
  getAllDocumentsForProcessing(): Promise<UserDocument[]>;
  getAllDocumentsForAdmin(): Promise<any[]>;
  
  // Document processing operations
  createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk>;
  createDocumentEmbedding(embedding: InsertDocumentEmbedding): Promise<DocumentEmbedding>;
  deleteDocumentChunks(documentId: string): Promise<void>;
  searchSimilarContent(userId: string, queryEmbedding: number[], topK: number, threshold: number): Promise<Array<{chunk: DocumentChunk, document: UserDocument, similarity: number}>>;
  getDocumentContext(userId: string, documentIds: string[]): Promise<{chunks: DocumentChunk[], documents: UserDocument[]}>;

  // Student memory operations
  createStudent(student: InsertStudent): Promise<Student>;
  getStudentsByOwner(userId: string): Promise<Student[]>;
  getStudent(studentId: string, userId: string): Promise<Student | undefined>;
  updateStudent(studentId: string, userId: string, updates: Partial<Student>): Promise<Student>;
  deleteStudent(studentId: string, userId: string): Promise<void>;
  
  // Student document pins
  pinDocument(studentId: string, docId: string, userId: string): Promise<StudentDocPin>;
  unpinDocument(pinId: string, userId: string): Promise<void>;
  getStudentPinnedDocs(studentId: string, userId: string): Promise<Array<{ pin: StudentDocPin, document: UserDocument }>>;
  
  // Tutor sessions
  createTutorSession(session: Omit<InsertTutorSession, 'userId'>, userId: string): Promise<TutorSession>;
  updateTutorSession(sessionId: string, userId: string, updates: Partial<TutorSession>): Promise<TutorSession>;
  getStudentSessions(studentId: string, userId: string, limit?: number): Promise<TutorSession[]>;
  getLastStudentSession(studentId: string, userId: string, daysLimit?: number): Promise<TutorSession | undefined>;
  
  // Memory export/delete
  exportStudentMemory(studentId: string, userId: string): Promise<{ student: Student, pinnedDocs: Array<{ pin: StudentDocPin, document: UserDocument }>, sessions: TutorSession[] }>;
  deleteStudentMemory(studentId: string, userId: string, deleteProfile: boolean): Promise<void>;

  // Agent session operations (for dynamic agent creation)
  createAgentSession(session: any): Promise<any>;
  getAgentSession(sessionId: string): Promise<any | undefined>;
  updateAgentSession(sessionId: string, updates: any): Promise<void>;
  endAgentSession(sessionId: string): Promise<void>;
  getExpiredAgentSessions(hoursOld: number): Promise<any[]>;
  getOrphanedAgentSessions(cutoffDate: Date): Promise<any[]>;
  getDocumentContent(documentId: string): Promise<Buffer | undefined>;
  
  // Marketing campaign operations
  createCampaign(campaign: InsertMarketingCampaign): Promise<MarketingCampaign>;
  getCampaigns(options: { page: number; limit: number }): Promise<{ campaigns: MarketingCampaign[]; total: number }>;
  getContactsForSegment(segment: string): Promise<User[]>;

  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  private testSessions: LearningSession[] = [];
  private testQuizAttempts: QuizAttempt[] = [];
  private testUserProgress: Map<string, UserProgress> = new Map();

  constructor() {
    // Use MemoryStore for development testing when database is not available
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) {
      console.log("Using in-memory session store for development");
      const SessionMemoryStore = MemoryStore(session);
      this.sessionStore = new SessionMemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
    } else {
      this.sessionStore = new PostgresSessionStore({ 
        conString: process.env.DATABASE_URL,
        tableName: 'session',
        createTableIfMissing: true 
      });
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    // Return test user in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && id === 'test-user-id') {
      return {
        id: 'test-user-id',
        username: 'test@example.com',
        email: 'test@example.com',
        password: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        subscriptionPlan: 'all',
        subscriptionStatus: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        weeklyVoiceMinutesUsed: 0,
        weeklyResetDate: new Date(),
        preferredLanguage: 'english',
        voiceStyle: 'cheerful',
        speechSpeed: '1.0',
        volumeLevel: 75,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
    }
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser as any)
      .returning();
    return user;
  }

  async updateUserSettings(userId: string, settings: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, plan: 'starter' | 'standard' | 'pro' | 'single' | 'all', status: 'active' | 'canceled' | 'paused', monthlyMinutes?: number): Promise<User> {
    const updateData: any = {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      updatedAt: new Date(),
    };

    // Set monthly allowance if provided
    if (monthlyMinutes !== undefined) {
      updateData.monthlyVoiceMinutes = monthlyMinutes;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async resetUserVoiceUsage(userId: string): Promise<void> {
    // Reset monthly usage counter and set next reset date to 30 days from now
    const nextResetDate = new Date();
    nextResetDate.setDate(nextResetDate.getDate() + 30);

    await db
      .update(users)
      .set({
        monthlyVoiceMinutesUsed: 0,
        monthlyResetDate: nextResetDate,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateUserVoiceUsage(userId: string, minutesUsed: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    // Check if we need to reset monthly usage based on reset date
    const now = new Date();
    const resetDate = user.monthlyResetDate ? new Date(user.monthlyResetDate) : now;
    
    if (now >= resetDate) {
      // Auto-reset if past reset date
      await this.resetUserVoiceUsage(userId);
      
      // Then add the new usage
      await db
        .update(users)
        .set({
          monthlyVoiceMinutesUsed: minutesUsed,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Add to current usage
      await db
        .update(users)
        .set({
          monthlyVoiceMinutesUsed: (user.monthlyVoiceMinutesUsed || 0) + minutesUsed,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
  }

  async canUserUseVoice(userId: string): Promise<boolean> {
    // Always allow voice usage when in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return true;
    }
    
    const user = await this.getUser(userId);
    if (!user) return false;

    // Check subscription status
    if (!user.subscriptionStatus || user.subscriptionStatus !== 'active') {
      return false;
    }

    // Check monthly allowance vs usage
    const monthlyLimit = user.monthlyVoiceMinutes || 60;
    const monthlyUsed = user.monthlyVoiceMinutesUsed || 0;
    
    return monthlyUsed < monthlyLimit;
  }

  async getAvailableMinutes(userId: string): Promise<{ total: number; used: number; remaining: number; bonusMinutes: number }> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const monthlyMinutes = user.monthlyVoiceMinutes || 60;
    const bonusMinutes = user.bonusMinutes || 0;
    const totalMinutes = monthlyMinutes + bonusMinutes;
    const usedMinutes = user.monthlyVoiceMinutesUsed || 0;
    const remainingMinutes = Math.max(0, totalMinutes - usedMinutes);

    return {
      total: totalMinutes,
      used: usedMinutes,
      remaining: remainingMinutes,
      bonusMinutes: bonusMinutes,
    };
  }

  async addBonusMinutes(userId: string, minutes: number): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const currentBonus = user.bonusMinutes || 0;
    const [updatedUser] = await db
      .update(users)
      .set({
        bonusMinutes: currentBonus + minutes,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    return updatedUser;
  }

  async updateUserMarketingPreferences(userId: string, optIn: boolean): Promise<User> {
    const updateData: any = {
      marketingOptIn: optIn,
      updatedAt: new Date(),
    };

    // Set opt-out date if unsubscribing
    if (!optIn) {
      updateData.marketingOptOutDate = new Date();
    } else {
      // Set opt-in date if subscribing
      updateData.marketingOptInDate = new Date();
      updateData.marketingOptOutDate = null;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createUsageLog(userId: string, minutesUsed: number, sessionType: 'voice' | 'text', sessionId?: string): Promise<void> {
    await db.insert(usageLogs).values({
      userId,
      minutesUsed,
      sessionType,
      sessionId,
    });
  }

  async getUserDashboard(userId: string): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    // Return test dashboard in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      return {
        user: {
          name: 'Test User',
          firstName: 'Test',
          initials: 'TU',
          plan: 'All Subjects Plan',
        },
        subjectProgress: [
          {
            subject: { id: 'math', name: 'Math', description: 'Master mathematical concepts', iconColor: 'blue', isActive: true },
            completed: 3,
            total: 10,
            progressPercentage: 30,
            avgQuizScore: 85,
          },
          {
            subject: { id: 'english', name: 'English', description: 'Improve language skills', iconColor: 'green', isActive: true },
            completed: 2,
            total: 8,
            progressPercentage: 25,
            avgQuizScore: 90,
          },
          {
            subject: { id: 'spanish', name: 'Spanish', description: 'Learn Spanish language', iconColor: 'yellow', isActive: true },
            completed: 1,
            total: 12,
            progressPercentage: 8,
            avgQuizScore: 75,
          },
        ],
        usage: {
          voiceMinutes: '0 / 90 min',
          percentage: 0,
        },
      };
    }

    // Get all subjects and progress
    const allSubjects = await db.select().from(subjects).where(eq(subjects.isActive, true));
    
    const subjectProgress = await Promise.all(
      allSubjects.map(async (subject) => {
        const subjectLessons = await db
          .select()
          .from(lessons)
          .where(and(eq(lessons.subjectId, subject.id), eq(lessons.isActive, true)))
          .orderBy(asc(lessons.orderIndex));

        const progressData = await db
          .select()
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, userId),
              sql`${userProgress.lessonId} IN ${sql.raw(`(${subjectLessons.map(l => `'${l.id}'`).join(',')})`)}`,
            )
          );

        const completed = progressData.filter(p => p.status === 'completed' || p.status === 'mastered').length;
        const total = subjectLessons.length;
        const avgScore = progressData.length > 0 
          ? progressData.reduce((acc, p) => acc + (p.quizScore || 0), 0) / progressData.length 
          : 0;

        return {
          subject,
          completed,
          total,
          progressPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
          avgQuizScore: Math.round(avgScore),
        };
      })
    );

    // Get usage info
    const weeklyLimit = user.subscriptionPlan === 'all' ? 90 : 60;
    const usagePercentage = Math.round(((user.weeklyVoiceMinutesUsed || 0) / weeklyLimit) * 100);

    return {
      user: {
        name: `${user.firstName} ${user.lastName}`.trim() || user.username,
        firstName: user.firstName,
        initials: `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.username[0].toUpperCase(),
        plan: user.subscriptionPlan === 'all' ? 'All Subjects Plan' : 'Single Subject Plan',
      },
      subjectProgress,
      usage: {
        voiceMinutes: `${user.weeklyVoiceMinutesUsed || 0} / ${weeklyLimit} min`,
        percentage: usagePercentage,
      },
    };
  }

  async getResumeSession(userId: string): Promise<any> {
    // Return null for test mode (no resume session)
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      return null;
    }
    
    const lastSession = await db
      .select({
        id: learningSessions.id,
        lessonId: learningSessions.lessonId,
        lastAccessed: learningSessions.startedAt,
        lesson: {
          title: lessons.title,
          subjectId: lessons.subjectId,
        },
        subject: {
          name: subjects.name,
        },
        progress: {
          progressPercentage: userProgress.progressPercentage,
        },
      })
      .from(learningSessions)
      .leftJoin(lessons, eq(learningSessions.lessonId, lessons.id))
      .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
      .leftJoin(userProgress, and(
        eq(userProgress.userId, userId),
        eq(userProgress.lessonId, learningSessions.lessonId)
      ))
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt))
      .limit(1);

    if (lastSession.length === 0) return null;

    const session = lastSession[0];
    const timeDiff = Date.now() - (session.lastAccessed?.getTime() || 0);
    const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));

    return {
      hasResumeSession: true,
      session: {
        subject: session.subject?.name,
        lesson: session.lesson?.title,
        lastActivity: hoursAgo < 1 ? 'Less than an hour ago' : `${hoursAgo} hours ago`,
        progressPercentage: session.progress?.progressPercentage || 0,
      },
      lessonId: session.lessonId,
    };
  }

  async getAllSubjects(): Promise<Subject[]> {
    // Return test subjects in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return [
        {
          id: 'math',
          name: 'Math',
          description: 'Master mathematical concepts from basic to advanced',
          iconColor: 'blue',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
        {
          id: 'english',
          name: 'English',
          description: 'Improve grammar, writing, and comprehension skills',
          iconColor: 'green',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
        {
          id: 'spanish',
          name: 'Spanish',
          description: 'Learn Spanish language from beginner to fluent',
          iconColor: 'yellow',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
      ];
    }
    return await db.select().from(subjects).where(eq(subjects.isActive, true)).orderBy(asc(subjects.name));
  }

  async getSubjectLessons(subjectId: string): Promise<Lesson[]> {
    // Return test lessons in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const testLessons = {
        math: [
          {
            id: 'math-1',
            subjectId: 'math',
            title: 'Introduction to Numbers',
            description: 'Learn the basics of counting and number recognition',
            content: { type: 'basic', difficulty: 'easy' },
            orderIndex: 1,
            estimatedMinutes: 15,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
          {
            id: 'math-2',
            subjectId: 'math',
            title: 'Addition and Subtraction',
            description: 'Master basic arithmetic operations',
            content: { type: 'arithmetic', difficulty: 'easy' },
            orderIndex: 2,
            estimatedMinutes: 20,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
        english: [
          {
            id: 'english-1',
            subjectId: 'english',
            title: 'Parts of Speech',
            description: 'Understanding nouns, verbs, and adjectives',
            content: { type: 'grammar', difficulty: 'medium' },
            orderIndex: 1,
            estimatedMinutes: 25,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
        spanish: [
          {
            id: 'spanish-1',
            subjectId: 'spanish',
            title: 'Basic Greetings',
            description: 'Learn common Spanish greetings and phrases',
            content: { type: 'vocabulary', difficulty: 'easy' },
            orderIndex: 1,
            estimatedMinutes: 15,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
      };
      return testLessons[subjectId as keyof typeof testLessons] || [];
    }
    return await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.subjectId, subjectId), eq(lessons.isActive, true)))
      .orderBy(asc(lessons.orderIndex));
  }

  async getLessonById(lessonId: string): Promise<Lesson | undefined> {
    // Return test lesson in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const testLessons: Record<string, Lesson> = {
        'math-1': {
          id: 'math-1',
          subjectId: 'math',
          title: 'Introduction to Numbers',
          description: 'Learn the basics of counting and number recognition',
          content: { 
            type: 'lesson',
            concepts: ['Numbers 1-10', 'Counting', 'Number recognition'],
            examples: ['Count from 1 to 10', 'Identify numbers in order'],
            quiz: [
              { question: 'What comes after 5?', answer: '6' },
              { question: 'How many fingers do you have?', answer: '10' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 15,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'math-2': {
          id: 'math-2',
          subjectId: 'math',
          title: 'Addition and Subtraction',
          description: 'Master basic arithmetic operations',
          content: { 
            type: 'lesson',
            concepts: ['Addition', 'Subtraction', 'Basic equations'],
            examples: ['2 + 3 = 5', '7 - 4 = 3'],
            quiz: [
              { question: 'What is 3 + 4?', answer: '7' },
              { question: 'What is 10 - 6?', answer: '4' }
            ]
          },
          orderIndex: 2,
          estimatedMinutes: 20,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'english-1': {
          id: 'english-1',
          subjectId: 'english',
          title: 'Parts of Speech',
          description: 'Understanding nouns, verbs, and adjectives',
          content: { 
            type: 'lesson',
            concepts: ['Nouns', 'Verbs', 'Adjectives'],
            examples: ['Cat is a noun', 'Run is a verb', 'Blue is an adjective'],
            quiz: [
              { question: 'Is "dog" a noun or verb?', answer: 'noun' },
              { question: 'Is "jump" a noun or verb?', answer: 'verb' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 25,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'spanish-1': {
          id: 'spanish-1',
          subjectId: 'spanish',
          title: 'Basic Greetings',
          description: 'Learn common Spanish greetings and phrases',
          content: { 
            type: 'lesson',
            concepts: ['Hola', 'Buenos días', 'Adiós'],
            examples: ['Hola means Hello', 'Buenos días means Good morning'],
            quiz: [
              { question: 'How do you say Hello in Spanish?', answer: 'Hola' },
              { question: 'What does "Adiós" mean?', answer: 'Goodbye' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 15,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
      };
      return testLessons[lessonId];
    }
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    return lesson || undefined;
  }

  async getUserProgress(userId: string, lessonId: string): Promise<UserProgress | undefined> {
    // Return test progress in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      // Return some progress for first math lesson, none for others
      if (lessonId === 'math-1') {
        return {
          id: 'progress-1',
          userId: 'test-user-id',
          lessonId: 'math-1',
          status: 'in_progress',
          progressPercentage: 50,
          quizScore: 85,
          timeSpent: 10,
          lastAccessed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as UserProgress;
      }
      return undefined;
    }
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)));
    return progress || undefined;
  }

  async updateUserProgress(userId: string, lessonId: string, progressData: Partial<UserProgress>): Promise<UserProgress> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const key = `${userId}-${lessonId}`;
      const existing = this.testUserProgress.get(key);
      const progress: UserProgress = existing ? {
        ...existing,
        ...progressData,
        updatedAt: new Date()
      } : {
        id: `progress-${Date.now()}`,
        userId,
        lessonId,
        status: progressData.status || 'not_started',
        progressPercentage: progressData.progressPercentage || 0,
        lastAccessed: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        quizScore: progressData.quizScore || null,
        timeSpent: progressData.timeSpent || null
      };
      this.testUserProgress.set(key, progress);
      return progress;
    }
    
    const existing = await this.getUserProgress(userId, lessonId);
    
    if (existing) {
      const [updated] = await db
        .update(userProgress)
        .set({ ...progressData, updatedAt: new Date() })
        .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userProgress)
        .values({
          userId,
          lessonId,
          ...progressData,
        })
        .returning();
      return created;
    }
  }

  async createLearningSession(sessionData: InsertLearningSession): Promise<LearningSession> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const session: LearningSession = {
        id: `session-${Date.now()}`,
        userId: sessionData.userId,
        lessonId: sessionData.lessonId || null,
        sessionType: sessionData.sessionType as "voice" | "text" | "quiz",
        startedAt: new Date(),
        endedAt: null,
        duration: null,
        transcript: null,
        feedback: null,
        voiceMinutesUsed: 0,
        isCompleted: false
      };
      this.testSessions.push(session);
      return session;
    }
    
    const [session] = await db
      .insert(learningSessions)
      .values(sessionData as any)
      .returning();
    return session;
  }

  async endLearningSession(sessionId: string, userId: string, updates: Partial<LearningSession>): Promise<LearningSession> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const session = this.testSessions.find(s => s.id === sessionId && s.userId === userId);
      if (!session) {
        throw new Error('Session not found');
      }
      Object.assign(session, updates);
      return session;
    }
    
    const [session] = await db
      .update(learningSessions)
      .set(updates)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .returning();
    return session;
  }

  async getUserSessions(userId: string): Promise<LearningSession[]> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return this.testSessions
        .filter(s => s.userId === userId)
        .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
    }
    
    return await db
      .select()
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt));
  }

  async createQuizAttempt(attemptData: InsertQuizAttempt): Promise<QuizAttempt> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const attempt: QuizAttempt = {
        id: `quiz-${Date.now()}`,
        userId: attemptData.userId,
        lessonId: attemptData.lessonId,
        sessionId: attemptData.sessionId || null,
        answers: attemptData.answers as any,
        score: attemptData.score,
        totalQuestions: attemptData.totalQuestions,
        timeSpent: attemptData.timeSpent || null,
        createdAt: new Date(),
        completedAt: new Date()
      };
      this.testQuizAttempts.push(attempt);
      return attempt;
    }
    
    const [attempt] = await db
      .insert(quizAttempts)
      .values(attemptData)
      .returning();
    return attempt;
  }

  async getUserQuizAttempts(userId: string, lessonId?: string): Promise<QuizAttempt[]> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return this.testQuizAttempts
        .filter(a => a.userId === userId && (!lessonId || a.lessonId === lessonId))
        .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
    }
    
    const whereClause = lessonId
      ? and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId))
      : eq(quizAttempts.userId, userId);

    return await db
      .select()
      .from(quizAttempts)
      .where(whereClause)
      .orderBy(desc(quizAttempts.completedAt));
  }

  async getAdminUsers(options: { page: number; limit: number; search: string }): Promise<any> {
    const { page, limit, search } = options;
    const offset = (page - 1) * limit;

    const whereClause = search
      ? or(
          like(users.username, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )
      : undefined;

    const usersList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        subscriptionPlan: users.subscriptionPlan,
        subscriptionStatus: users.subscriptionStatus,
        weeklyVoiceMinutesUsed: users.weeklyVoiceMinutesUsed,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    return {
      users: usersList,
      totalCount: totalCount.count,
      page,
      limit,
      totalPages: Math.ceil(totalCount.count / limit),
    };
  }

  async getAdminStats(): Promise<any> {
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [activeSubscriptions] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.subscriptionStatus, 'active'));

    // Calculate monthly revenue (mock calculation)
    const monthlyRevenue = activeSubscriptions.count * 150; // Average plan price

    const [avgSessionTime] = await db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${learningSessions.endedAt} - ${learningSessions.startedAt})) / 60)`.as('avg')
      })
      .from(learningSessions)
      .where(sql`${learningSessions.endedAt} IS NOT NULL`);

    return {
      totalUsers: totalUsers.count,
      activeSubscriptions: activeSubscriptions.count,
      monthlyRevenue: `$${monthlyRevenue.toLocaleString()}`,
      avgSessionTime: `${Math.round(avgSessionTime.avg || 0)} min`,
    };
  }

  async exportUsersCSV(): Promise<string> {
    const allUsers = await db
      .select({
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        parentName: users.parentName,
        studentName: users.studentName,
        studentAge: users.studentAge,
        gradeLevel: users.gradeLevel,
        primarySubject: users.primarySubject,
        subscriptionPlan: users.subscriptionPlan,
        subscriptionStatus: users.subscriptionStatus,
        marketingOptIn: users.marketingOptIn,
        marketingOptInDate: users.marketingOptInDate,
        marketingOptOutDate: users.marketingOptOutDate,
        weeklyVoiceMinutesUsed: users.weeklyVoiceMinutesUsed,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    // Helper function to escape CSV values properly
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      // If value contains comma, newline, or double quote, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Username',
      'Email',
      'First Name',
      'Last Name',
      'Parent Name',
      'Student Name',
      'Student Age',
      'Grade Level',
      'Primary Subject',
      'Subscription Plan',
      'Subscription Status',
      'Marketing Opt-In',
      'Marketing Opt-In Date',
      'Marketing Opt-Out Date',
      'Weekly Voice Minutes Used',
      'Created At',
    ];

    const csvRows = [
      headers.map(escapeCSV).join(','),
      ...allUsers.map(user => [
        user.username,
        user.email,
        user.firstName || '',
        user.lastName || '',
        user.parentName || '',
        user.studentName || '',
        user.studentAge || '',
        user.gradeLevel || '',
        user.primarySubject || '',
        user.subscriptionPlan || '',
        user.subscriptionStatus || '',
        user.marketingOptIn ? 'Yes' : 'No',
        user.marketingOptInDate?.toISOString() || '',
        user.marketingOptOutDate?.toISOString() || '',
        user.weeklyVoiceMinutesUsed || 0,
        user.createdAt?.toISOString() || '',
      ].map(escapeCSV).join(','))
    ];

    return csvRows.join('\n');
  }

  // Admin audit log operations
  async createAdminLog(log: InsertAdminLog): Promise<AdminLog> {
    const [created] = await db.insert(adminLogs).values(log).returning();
    return created;
  }

  async getAdminLogs(options: { page: number; limit: number; adminId?: string; action?: string }): Promise<{ logs: AdminLog[]; total: number }> {
    const { page, limit, adminId, action } = options;
    const offset = (page - 1) * limit;

    // Build where clauses
    const whereConditions = [];
    if (adminId) {
      whereConditions.push(eq(adminLogs.adminId, adminId));
    }
    if (action) {
      whereConditions.push(eq(adminLogs.action, action));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get logs with pagination
    const logs = await db
      .select()
      .from(adminLogs)
      .where(whereClause)
      .orderBy(desc(adminLogs.timestamp))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(adminLogs)
      .where(whereClause);

    return { logs, total };
  }

  // Document operations implementation
  async uploadDocument(userId: string, document: InsertUserDocument): Promise<UserDocument> {
    const [created] = await db.insert(userDocuments).values({...document, userId}).returning();
    return created;
  }

  async getUserDocuments(userId: string): Promise<UserDocument[]> {
    return await db.select().from(userDocuments).where(eq(userDocuments.userId, userId)).orderBy(desc(userDocuments.createdAt));
  }

  async getAllDocumentsForProcessing(): Promise<UserDocument[]> {
    return await db.select().from(userDocuments).orderBy(desc(userDocuments.createdAt));
  }

  async getAllDocumentsForAdmin(): Promise<any[]> {
    const docs = await db.select({
      id: userDocuments.id,
      filename: userDocuments.filename,
      mimeType: userDocuments.mimeType,
      fileSize: userDocuments.fileSize,
      userId: userDocuments.userId,
      createdAt: userDocuments.createdAt,
    }).from(userDocuments).orderBy(desc(userDocuments.createdAt));

    // Get user emails for each document
    const docsWithEmails = await Promise.all(
      docs.map(async (doc) => {
        const user = await this.getUser(doc.userId);
        return {
          ...doc,
          ownerEmail: user?.email || 'Unknown',
        };
      })
    );

    return docsWithEmails;
  }

  async getDocument(documentId: string, userId: string): Promise<UserDocument | undefined> {
    const [doc] = await db.select().from(userDocuments).where(and(eq(userDocuments.id, documentId), eq(userDocuments.userId, userId)));
    return doc || undefined;
  }

  async deleteDocument(documentId: string, userId: string): Promise<void> {
    await db.delete(userDocuments).where(and(eq(userDocuments.id, documentId), eq(userDocuments.userId, userId)));
  }

  async updateDocument(documentId: string, userId: string, updates: Partial<UserDocument>): Promise<UserDocument> {
    const [updated] = await db.update(userDocuments).set({...updates, updatedAt: new Date()}).where(and(eq(userDocuments.id, documentId), eq(userDocuments.userId, userId))).returning();
    return updated;
  }

  async updateDocumentById(documentId: string, updates: Partial<UserDocument>): Promise<UserDocument | null> {
    const [updated] = await db.update(userDocuments).set({...updates, updatedAt: new Date()}).where(eq(userDocuments.id, documentId)).returning();
    return updated || null;
  }

  async createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk> {
    const [created] = await db.insert(documentChunks).values(chunk).returning();
    return created;
  }

  async createDocumentEmbedding(embedding: InsertDocumentEmbedding): Promise<DocumentEmbedding> {
    const [created] = await db.insert(documentEmbeddings).values(embedding).returning();
    return created;
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  }

  async searchSimilarContent(userId: string, queryEmbedding: number[], topK: number, threshold: number): Promise<Array<{chunk: DocumentChunk, document: UserDocument, similarity: number}>> {
    // In a real implementation, this would use vector similarity search
    // For now, return empty array
    return [];
  }

  async getDocumentContext(userId: string, documentIds: string[]): Promise<{chunks: DocumentChunk[], documents: UserDocument[]}> {
    const documents = await db.select().from(userDocuments)
      .where(and(
        eq(userDocuments.userId, userId),
        sql`${userDocuments.id} IN (${documentIds.map(id => sql`${id}`).join(sql`, `)})`
      ));
    
    const chunks = await db.select().from(documentChunks)
      .where(sql`${documentChunks.documentId} IN (${documentIds.map(id => sql`${id}`).join(sql`, `)})`)
      .orderBy(asc(documentChunks.chunkIndex));
    
    return { chunks, documents };
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    const [created] = await db.insert(students).values(student).returning();
    return created;
  }

  async getStudentsByOwner(userId: string): Promise<Student[]> {
    return await db.select().from(students).where(eq(students.ownerUserId, userId)).orderBy(desc(students.createdAt));
  }

  async getStudent(studentId: string, userId: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)));
    return student;
  }

  async updateStudent(studentId: string, userId: string, updates: Partial<Student>): Promise<Student> {
    const [updated] = await db.update(students)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)))
      .returning();
    if (!updated) throw new Error('Student not found or unauthorized');
    return updated;
  }

  async deleteStudent(studentId: string, userId: string): Promise<void> {
    await db.delete(students).where(and(eq(students.id, studentId), eq(students.ownerUserId, userId)));
  }

  async pinDocument(studentId: string, docId: string, userId: string): Promise<StudentDocPin> {
    const student = await this.getStudent(studentId, userId);
    if (!student) throw new Error('Student not found or unauthorized');
    
    const doc = await this.getDocument(docId, userId);
    if (!doc) throw new Error('Document not found or unauthorized');
    
    try {
      const [pin] = await db.insert(studentDocPins).values({ studentId, docId }).returning();
      return pin;
    } catch (error: any) {
      if (error.code === '23505') {
        const [existing] = await db.select().from(studentDocPins).where(and(eq(studentDocPins.studentId, studentId), eq(studentDocPins.docId, docId)));
        return existing;
      }
      throw error;
    }
  }

  async unpinDocument(pinId: string, userId: string): Promise<void> {
    await db.delete(studentDocPins)
      .where(and(
        eq(studentDocPins.id, pinId),
        sql`${studentDocPins.studentId} IN (SELECT id FROM ${students} WHERE ${students.ownerUserId} = ${userId})`
      ));
  }

  async getStudentPinnedDocs(studentId: string, userId: string): Promise<Array<{ pin: StudentDocPin, document: UserDocument }>> {
    const student = await this.getStudent(studentId, userId);
    if (!student) return [];
    
    const pins = await db.select().from(studentDocPins).where(eq(studentDocPins.studentId, studentId));
    const results: Array<{ pin: StudentDocPin, document: UserDocument }> = [];
    
    for (const pin of pins) {
      const [doc] = await db.select().from(userDocuments).where(eq(userDocuments.id, pin.docId));
      if (doc) {
        results.push({ pin, document: doc });
      }
    }
    
    return results;
  }

  async createTutorSession(session: Omit<InsertTutorSession, 'userId'>, userId: string): Promise<TutorSession> {
    const student = await this.getStudent(session.studentId, userId);
    if (!student) throw new Error('Student not found or unauthorized');
    
    const [created] = await db.insert(tutorSessions).values({ ...session, userId }).returning();
    return created;
  }

  async updateTutorSession(sessionId: string, userId: string, updates: Partial<TutorSession>): Promise<TutorSession> {
    const [updated] = await db.update(tutorSessions)
      .set(updates)
      .where(and(eq(tutorSessions.id, sessionId), eq(tutorSessions.userId, userId)))
      .returning();
    if (!updated) throw new Error('Session not found or unauthorized');
    return updated;
  }

  async getStudentSessions(studentId: string, userId: string, limit: number = 10): Promise<TutorSession[]> {
    const student = await this.getStudent(studentId, userId);
    if (!student) return [];
    
    return await db.select().from(tutorSessions)
      .where(eq(tutorSessions.studentId, studentId))
      .orderBy(desc(tutorSessions.startedAt))
      .limit(limit);
  }

  async getLastStudentSession(studentId: string, userId: string, daysLimit: number = 30): Promise<TutorSession | undefined> {
    const student = await this.getStudent(studentId, userId);
    if (!student) return undefined;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);
    
    const [lastSession] = await db.select().from(tutorSessions)
      .where(and(
        eq(tutorSessions.studentId, studentId),
        sql`${tutorSessions.startedAt} >= ${cutoffDate}`
      ))
      .orderBy(desc(tutorSessions.startedAt))
      .limit(1);
    
    return lastSession;
  }

  async exportStudentMemory(studentId: string, userId: string): Promise<{ student: Student, pinnedDocs: Array<{ pin: StudentDocPin, document: UserDocument }>, sessions: TutorSession[] }> {
    const student = await this.getStudent(studentId, userId);
    if (!student) throw new Error('Student not found');
    
    const pinnedDocs = await this.getStudentPinnedDocs(studentId, userId);
    const sessions = await this.getStudentSessions(studentId, userId, 100);
    
    return { student, pinnedDocs, sessions };
  }

  async deleteStudentMemory(studentId: string, userId: string, deleteProfile: boolean): Promise<void> {
    const student = await this.getStudent(studentId, userId);
    if (!student) throw new Error('Student not found');
    
    if (deleteProfile) {
      await this.deleteStudent(studentId, userId);
    } else {
      await db.delete(tutorSessions).where(eq(tutorSessions.studentId, studentId));
    }
  }

  // Agent session operations (for dynamic agent creation)
  async createAgentSession(session: any): Promise<any> {
    const [newSession] = await db.insert(agentSessions).values(session).returning();
    return newSession;
  }

  async getAgentSession(sessionId: string): Promise<any | undefined> {
    const [session] = await db.select().from(agentSessions)
      .where(eq(agentSessions.id, sessionId))
      .limit(1);
    return session;
  }

  async updateAgentSession(sessionId: string, updates: any): Promise<void> {
    await db.update(agentSessions)
      .set(updates)
      .where(eq(agentSessions.id, sessionId));
  }

  async endAgentSession(sessionId: string): Promise<void> {
    await db.update(agentSessions)
      .set({ endedAt: new Date() })
      .where(eq(agentSessions.id, sessionId));
  }

  async getExpiredAgentSessions(hoursOld: number): Promise<any[]> {
    const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    const expired = await db.select().from(agentSessions)
      .where(and(
        sql`${agentSessions.expiresAt} < ${cutoffDate}`,
        sql`${agentSessions.endedAt} IS NULL`
      ));
    return expired;
  }

  async getOrphanedAgentSessions(cutoffDate: Date): Promise<any[]> {
    // Find sessions older than cutoffDate with no agentId (failed creations)
    const orphaned = await db.select().from(agentSessions)
      .where(and(
        sql`${agentSessions.endedAt} IS NULL`,
        sql`${agentSessions.agentId} IS NULL`,
        sql`${agentSessions.createdAt} < ${cutoffDate}`
      ));
    return orphaned;
  }

  async getDocumentContent(documentId: string): Promise<Buffer | undefined> {
    console.log(`[Storage] Getting content for document ${documentId}`);
    const [doc] = await db.select().from(userDocuments)
      .where(eq(userDocuments.id, documentId))
      .limit(1);
    
    if (!doc) {
      console.log(`[Storage] Document ${documentId} not found in database`);
      return undefined;
    }
    
    if (!doc.filePath) {
      console.log(`[Storage] Document ${documentId} has no filePath: ${JSON.stringify(doc)}`);
      return undefined;
    }
    
    console.log(`[Storage] Reading file from: ${doc.filePath}`);
    
    // Read the file from disk
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(doc.filePath);
      console.log(`[Storage] Successfully read ${content.length} bytes from ${doc.filePath}`);
      return content;
    } catch (error) {
      console.error(`[Storage] Failed to read document ${documentId} from ${doc.filePath}:`, error);
      return undefined;
    }
  }
  
  // Marketing campaign operations
  async createCampaign(campaign: InsertMarketingCampaign): Promise<MarketingCampaign> {
    const [result] = await db.insert(marketingCampaigns).values(campaign).returning();
    return result;
  }
  
  async getCampaigns(options: { page: number; limit: number }): Promise<{ campaigns: MarketingCampaign[]; total: number }> {
    const offset = (options.page - 1) * options.limit;
    
    const campaigns = await db.query.marketingCampaigns.findMany({
      orderBy: [desc(marketingCampaigns.exportedAt)],
      limit: options.limit,
      offset,
    });
    
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(marketingCampaigns);
    
    return { campaigns, total };
  }
  
  async getContactsForSegment(segment: string): Promise<User[]> {
    let conditions: any[] = [eq(users.marketingOptIn, true)];
    
    switch (segment) {
      case 'all':
        // All users with marketing consent
        break;
        
      case 'free-users':
        // Users who never subscribed
        conditions.push(sql`${users.subscriptionStatus} IS NULL OR ${users.subscriptionStatus} = ''`);
        break;
        
      case 'cancelled':
        // Users with cancelled subscriptions
        conditions.push(eq(users.subscriptionStatus, 'canceled'));
        break;
        
      case 'inactive-30':
        // Users who haven't logged in for 30+ days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        conditions.push(sql`${users.updatedAt} < ${thirtyDaysAgo.toISOString()}`);
        break;
        
      case 'active-premium':
        // Active Premium/Pro subscribers
        conditions.push(
          eq(users.subscriptionStatus, 'active'),
          or(eq(users.subscriptionPlan, 'pro'), eq(users.subscriptionPlan, 'standard'))!
        );
        break;
        
      default:
        break;
    }
    
    return await db.select().from(users).where(and(...conditions));
  }
}



export const storage = new DatabaseStorage();
