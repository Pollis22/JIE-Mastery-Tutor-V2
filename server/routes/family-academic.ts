/**
 * Family Academic Command Center Routes
 * Consumer K-12 endpoints for parents managing children's academic profiles.
 * Mounted at /api/family-academic (authenticated) and /api/admin/family-academic (admin)
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { pool } from "../db";
import { eq, and, desc, asc, sql, gte, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  familyChildren,
  familyCourses,
  familyCalendarEvents,
  familyTasks,
  familyReminders,
  familyEngagementScores,
  familyStudyGoals,
  familyAchievements,
  familyStreaks,
  familyWeeklyReports,
  insertFamilyChildSchema,
  insertFamilyCourseSchema,
  insertFamilyCalendarEventSchema,
  insertFamilyTaskSchema,
  insertFamilyReminderSchema,
  insertFamilyEngagementScoreSchema,
  insertFamilyStudyGoalSchema,
  insertFamilyAchievementSchema,
  type FamilyChild,
  type FamilyTask,
  type FamilyCalendarEvent,
} from "@shared/schema";

// ============ HELPERS ============

function requireAuth(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function handleError(res: Response, err: unknown, context = "Operation failed") {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: err.errors });
  }
  console.error(`[Family Academic] ${context}:`, err);
  return res.status(500).json({ message: context });
}

function getUserId(req: Request): string {
  return (req.user as any).id;
}

// Auto-generate study tasks when a calendar event is created
function generateStudyTasks(
  event: { id: string; title: string; eventType: string | null; startDate: string; courseId: string | null },
  childId: string,
  parentUserId: string,
): Array<{ childId: string; parentUserId: string; courseId: string | null; eventId: string; title: string; taskType: string; dueDate: string; priority: string; estimatedMinutes: number; xpReward: number }> {
  const tasks: Array<{ childId: string; parentUserId: string; courseId: string | null; eventId: string; title: string; taskType: string; dueDate: string; priority: string; estimatedMinutes: number; xpReward: number }> = [];
  const eventDate = new Date(event.startDate);
  const type = (event.eventType || "").toLowerCase();

  function addDays(d: Date, n: number): string {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split("T")[0];
  }

  if (type === "test" || type === "exam") {
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Start reviewing for ${event.title}`, taskType: "review", dueDate: addDays(eventDate, -7), priority: "medium", estimatedMinutes: 30, xpReward: 10 });
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Continue review: ${event.title}`, taskType: "review", dueDate: addDays(eventDate, -5), priority: "medium", estimatedMinutes: 30, xpReward: 10 });
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Practice session for ${event.title}`, taskType: "practice", dueDate: addDays(eventDate, -3), priority: "high", estimatedMinutes: 45, xpReward: 15 });
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Final review: ${event.title} tomorrow!`, taskType: "review", dueDate: addDays(eventDate, -1), priority: "high", estimatedMinutes: 30, xpReward: 15 });
  } else if (type === "homework" || type === "project") {
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Work on ${event.title}`, taskType: "homework", dueDate: addDays(eventDate, -3), priority: "medium", estimatedMinutes: 30, xpReward: 10 });
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Finish ${event.title} — due tomorrow!`, taskType: "homework", dueDate: addDays(eventDate, -1), priority: "high", estimatedMinutes: 30, xpReward: 10 });
  } else if (type === "quiz") {
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Review for ${event.title}`, taskType: "review", dueDate: addDays(eventDate, -3), priority: "medium", estimatedMinutes: 20, xpReward: 10 });
    tasks.push({ childId, parentUserId, courseId: event.courseId, eventId: event.id, title: `Quick review: ${event.title} tomorrow`, taskType: "review", dueDate: addDays(eventDate, -1), priority: "high", estimatedMinutes: 15, xpReward: 10 });
  }

  return tasks;
}

// Calculate engagement score for a child in a given week
function calculateEngagementScore(stats: {
  sessionsCompleted: number;
  sessionsTarget: number;
  tasksCompleted: number;
  tasksTotal: number;
  studyMinutes: number;
  studyMinutesTarget: number;
  activeDays: number;
}): { score: number; riskLevel: string } {
  const sessionPoints = Math.min(40, (stats.sessionsCompleted / Math.max(1, stats.sessionsTarget)) * 40);
  const taskPoints = stats.tasksTotal > 0 ? (stats.tasksCompleted / stats.tasksTotal) * 30 : 30;
  const minutePoints = Math.min(20, (stats.studyMinutes / Math.max(1, stats.studyMinutesTarget)) * 20);
  const consistencyPoints = stats.activeDays >= 4 ? 10 : (stats.activeDays / 4) * 10;
  const score = Math.round(sessionPoints + taskPoints + minutePoints + consistencyPoints);

  let riskLevel = "on_track";
  if (score < 30) riskLevel = "critical";
  else if (score < 50) riskLevel = "at_risk";
  else if (score < 70) riskLevel = "needs_attention";

  return { score, riskLevel };
}

// Achievement definitions
const ACHIEVEMENT_DEFS = [
  { type: "streak_3", name: "3-Day Fire", emoji: "🔥", check: (streak: number) => streak >= 3 },
  { type: "streak_7", name: "7-Day Star", emoji: "⭐", check: (streak: number) => streak >= 7 },
  { type: "streak_14", name: "14-Day Trophy", emoji: "🏆", check: (streak: number) => streak >= 14 },
  { type: "streak_30", name: "Streak Master", emoji: "👑", check: (streak: number) => streak >= 30 },
];

// ============ ROUTER ============

export const familyAcademicRouter = Router();
familyAcademicRouter.use(requireAuth);

// ─── CHILDREN ───

// GET /children — list all children for authenticated parent
familyAcademicRouter.get("/children", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const children = await db
      .select()
      .from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, userId), eq(familyChildren.isActive, true)))
      .orderBy(asc(familyChildren.createdAt));
    res.json(children);
  } catch (err) {
    handleError(res, err, "Failed to fetch children");
  }
});

// POST /children — add a child
familyAcademicRouter.post("/children", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyChildSchema.parse({ ...req.body, parentUserId: userId });
    const [child] = await db.insert(familyChildren).values(data).returning();
    res.status(201).json(child);
  } catch (err) {
    handleError(res, err, "Failed to create child");
  }
});

// PUT /children/:id — update child
familyAcademicRouter.put("/children/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { childName, childAge, gradeLevel, avatarEmoji, color } = req.body;
    const [updated] = await db
      .update(familyChildren)
      .set({ childName, childAge, gradeLevel, avatarEmoji, color, updatedAt: new Date() })
      .where(and(eq(familyChildren.id, req.params.id), eq(familyChildren.parentUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Child not found" });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update child");
  }
});

// DELETE /children/:id — archive child (soft delete)
familyAcademicRouter.delete("/children/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [archived] = await db
      .update(familyChildren)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(familyChildren.id, req.params.id), eq(familyChildren.parentUserId, userId)))
      .returning();
    if (!archived) return res.status(404).json({ message: "Child not found" });
    res.json({ message: "Child archived", child: archived });
  } catch (err) {
    handleError(res, err, "Failed to archive child");
  }
});

// ─── COURSES ───

// GET /children/:childId/courses
familyAcademicRouter.get("/children/:childId/courses", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const courses = await db
      .select()
      .from(familyCourses)
      .where(and(eq(familyCourses.childId, req.params.childId), eq(familyCourses.parentUserId, userId), eq(familyCourses.isActive, true)))
      .orderBy(asc(familyCourses.courseName));
    res.json(courses);
  } catch (err) {
    handleError(res, err, "Failed to fetch courses");
  }
});

// POST /children/:childId/courses
familyAcademicRouter.post("/children/:childId/courses", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyCourseSchema.parse({ ...req.body, childId: req.params.childId, parentUserId: userId });
    const [course] = await db.insert(familyCourses).values(data).returning();
    res.status(201).json(course);
  } catch (err) {
    handleError(res, err, "Failed to create course");
  }
});

// PUT /courses/:id
familyAcademicRouter.put("/courses/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { courseName, teacherName, schoolName, semester, scheduleText, color } = req.body;
    const [updated] = await db
      .update(familyCourses)
      .set({ courseName, teacherName, schoolName, semester, scheduleText, color, updatedAt: new Date() })
      .where(and(eq(familyCourses.id, req.params.id), eq(familyCourses.parentUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Course not found" });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update course");
  }
});

// DELETE /courses/:id — archive
familyAcademicRouter.delete("/courses/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [archived] = await db
      .update(familyCourses)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(familyCourses.id, req.params.id), eq(familyCourses.parentUserId, userId)))
      .returning();
    if (!archived) return res.status(404).json({ message: "Course not found" });
    res.json({ message: "Course archived" });
  } catch (err) {
    handleError(res, err, "Failed to archive course");
  }
});

// ─── CALENDAR EVENTS ───

// GET /children/:childId/events?startDate=&endDate=
familyAcademicRouter.get("/children/:childId/events", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const conditions = [eq(familyCalendarEvents.childId, req.params.childId), eq(familyCalendarEvents.parentUserId, userId)];
    if (startDate) conditions.push(gte(familyCalendarEvents.startDate, startDate));
    if (endDate) conditions.push(lte(familyCalendarEvents.startDate, endDate));
    const events = await db
      .select()
      .from(familyCalendarEvents)
      .where(and(...conditions))
      .orderBy(asc(familyCalendarEvents.startDate));
    res.json(events);
  } catch (err) {
    handleError(res, err, "Failed to fetch events");
  }
});

// GET /events — all events across all children (for parent calendar)
familyAcademicRouter.get("/events", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const conditions = [eq(familyCalendarEvents.parentUserId, userId)];
    if (startDate) conditions.push(gte(familyCalendarEvents.startDate, startDate));
    if (endDate) conditions.push(lte(familyCalendarEvents.startDate, endDate));
    const events = await db
      .select()
      .from(familyCalendarEvents)
      .where(and(...conditions))
      .orderBy(asc(familyCalendarEvents.startDate));
    res.json(events);
  } catch (err) {
    handleError(res, err, "Failed to fetch events");
  }
});

// POST /children/:childId/events — create event + auto-generate study tasks
familyAcademicRouter.post("/children/:childId/events", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyCalendarEventSchema.parse({ ...req.body, childId: req.params.childId, parentUserId: userId });
    const [event] = await db.insert(familyCalendarEvents).values(data).returning();

    // Auto-generate study tasks based on event type
    const autoTasks = generateStudyTasks(
      { id: event.id, title: event.title, eventType: event.eventType, startDate: event.startDate, courseId: event.courseId },
      req.params.childId,
      userId,
    );
    if (autoTasks.length > 0) {
      await db.insert(familyTasks).values(autoTasks);
    }

    res.status(201).json({ event, autoTasksCreated: autoTasks.length });
  } catch (err) {
    handleError(res, err, "Failed to create event");
  }
});

// PUT /events/:id
familyAcademicRouter.put("/events/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { title, eventType, description, startDate, endDate, startTime, endTime, priority, status, notes, courseId } = req.body;
    const [updated] = await db
      .update(familyCalendarEvents)
      .set({ title, eventType, description, startDate, endDate, startTime, endTime, priority, status, notes, courseId })
      .where(and(eq(familyCalendarEvents.id, req.params.id), eq(familyCalendarEvents.parentUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Event not found" });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update event");
  }
});

// DELETE /events/:id
familyAcademicRouter.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [deleted] = await db
      .delete(familyCalendarEvents)
      .where(and(eq(familyCalendarEvents.id, req.params.id), eq(familyCalendarEvents.parentUserId, userId)))
      .returning();
    if (!deleted) return res.status(404).json({ message: "Event not found" });
    res.json({ message: "Event deleted" });
  } catch (err) {
    handleError(res, err, "Failed to delete event");
  }
});

// ─── TASKS ───

// GET /children/:childId/tasks?status=
familyAcademicRouter.get("/children/:childId/tasks", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const status = req.query.status as string | undefined;
    const conditions = [eq(familyTasks.childId, req.params.childId), eq(familyTasks.parentUserId, userId)];
    if (status) conditions.push(eq(familyTasks.status, status));
    const tasks = await db
      .select()
      .from(familyTasks)
      .where(and(...conditions))
      .orderBy(asc(familyTasks.dueDate));
    res.json(tasks);
  } catch (err) {
    handleError(res, err, "Failed to fetch tasks");
  }
});

// POST /children/:childId/tasks — manual task creation
familyAcademicRouter.post("/children/:childId/tasks", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyTaskSchema.parse({ ...req.body, childId: req.params.childId, parentUserId: userId });
    const [task] = await db.insert(familyTasks).values(data).returning();
    res.status(201).json(task);
  } catch (err) {
    handleError(res, err, "Failed to create task");
  }
});

// PUT /tasks/:id/complete — complete a task (awards XP, updates streak)
familyAcademicRouter.put("/tasks/:id/complete", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [task] = await db
      .update(familyTasks)
      .set({ status: "completed", completedAt: new Date(), actualMinutes: req.body.actualMinutes || null })
      .where(and(eq(familyTasks.id, req.params.id), eq(familyTasks.parentUserId, userId)))
      .returning();
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Update daily streak
    const today = new Date().toISOString().split("T")[0];
    await db
      .insert(familyStreaks)
      .values({ childId: task.childId, activityDate: today, hadTaskCompletion: true, studyMinutes: task.actualMinutes || 0 })
      .onConflictDoUpdate({
        target: [familyStreaks.childId, familyStreaks.activityDate],
        set: { hadTaskCompletion: true, studyMinutes: sql`family_streaks.study_minutes + ${task.actualMinutes || 0}` },
      });

    // Check streak achievements
    const streakResult = await db
      .select()
      .from(familyStreaks)
      .where(eq(familyStreaks.childId, task.childId))
      .orderBy(desc(familyStreaks.activityDate));

    let currentStreak = 0;
    const todayDate = new Date();
    for (const s of streakResult) {
      const d = new Date(s.activityDate);
      const expectedDate = new Date(todayDate);
      expectedDate.setDate(expectedDate.getDate() - currentStreak);
      if (d.toISOString().split("T")[0] === expectedDate.toISOString().split("T")[0]) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Award streak achievements
    const existingAchievements = await db
      .select()
      .from(familyAchievements)
      .where(eq(familyAchievements.childId, task.childId));
    const existingTypes = new Set(existingAchievements.map((a) => a.achievementType));

    const newAchievements: Array<{ childId: string; achievementType: string; achievementName: string; achievementEmoji: string }> = [];
    for (const def of ACHIEVEMENT_DEFS) {
      if (!existingTypes.has(def.type) && def.check(currentStreak)) {
        newAchievements.push({ childId: task.childId, achievementType: def.type, achievementName: def.name, achievementEmoji: def.emoji });
      }
    }
    if (newAchievements.length > 0) {
      await db.insert(familyAchievements).values(newAchievements);
    }

    // Check task count achievements
    const taskCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(familyTasks)
      .where(and(eq(familyTasks.childId, task.childId), eq(familyTasks.status, "completed")));
    const totalCompleted = Number(taskCountResult[0]?.count || 0);
    if (totalCompleted >= 50 && !existingTypes.has("task_machine")) {
      await db.insert(familyAchievements).values({
        childId: task.childId,
        achievementType: "task_machine",
        achievementName: "Task Machine",
        achievementEmoji: "⚡",
      });
      newAchievements.push({ childId: task.childId, achievementType: "task_machine", achievementName: "Task Machine", achievementEmoji: "⚡" });
    }

    res.json({
      task,
      xpEarned: task.xpReward || 10,
      currentStreak,
      newAchievements,
    });
  } catch (err) {
    handleError(res, err, "Failed to complete task");
  }
});

// PUT /tasks/:id — update task
familyAcademicRouter.put("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { title, taskType, dueDate, priority, status, estimatedMinutes, notes, xpReward } = req.body;
    const [updated] = await db
      .update(familyTasks)
      .set({ title, taskType, dueDate, priority, status, estimatedMinutes, notes, xpReward })
      .where(and(eq(familyTasks.id, req.params.id), eq(familyTasks.parentUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Task not found" });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update task");
  }
});

// DELETE /tasks/:id
familyAcademicRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [deleted] = await db
      .delete(familyTasks)
      .where(and(eq(familyTasks.id, req.params.id), eq(familyTasks.parentUserId, userId)))
      .returning();
    if (!deleted) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task deleted" });
  } catch (err) {
    handleError(res, err, "Failed to delete task");
  }
});

// ─── STUDY GOALS ───

// GET /children/:childId/goals
familyAcademicRouter.get("/children/:childId/goals", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const goals = await db
      .select()
      .from(familyStudyGoals)
      .where(and(eq(familyStudyGoals.childId, req.params.childId), eq(familyStudyGoals.parentUserId, userId), eq(familyStudyGoals.isActive, true)));
    res.json(goals);
  } catch (err) {
    handleError(res, err, "Failed to fetch goals");
  }
});

// POST /children/:childId/goals
familyAcademicRouter.post("/children/:childId/goals", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyStudyGoalSchema.parse({ ...req.body, childId: req.params.childId, parentUserId: userId });
    const [goal] = await db.insert(familyStudyGoals).values(data).returning();
    res.status(201).json(goal);
  } catch (err) {
    handleError(res, err, "Failed to create goal");
  }
});

// PUT /goals/:id
familyAcademicRouter.put("/goals/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { goalType, targetValue, currentValue, isActive } = req.body;
    const [updated] = await db
      .update(familyStudyGoals)
      .set({ goalType, targetValue, currentValue, isActive, updatedAt: new Date() })
      .where(and(eq(familyStudyGoals.id, req.params.id), eq(familyStudyGoals.parentUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Goal not found" });
    res.json(updated);
  } catch (err) {
    handleError(res, err, "Failed to update goal");
  }
});

// ─── ACHIEVEMENTS ───

// GET /children/:childId/achievements
familyAcademicRouter.get("/children/:childId/achievements", async (req: Request, res: Response) => {
  try {
    const achievements = await db
      .select()
      .from(familyAchievements)
      .where(eq(familyAchievements.childId, req.params.childId))
      .orderBy(desc(familyAchievements.earnedAt));
    res.json(achievements);
  } catch (err) {
    handleError(res, err, "Failed to fetch achievements");
  }
});

// ─── STREAKS ───

// GET /children/:childId/streaks — returns current streak count + recent streak data
familyAcademicRouter.get("/children/:childId/streaks", async (req: Request, res: Response) => {
  try {
    const streaks = await db
      .select()
      .from(familyStreaks)
      .where(eq(familyStreaks.childId, req.params.childId))
      .orderBy(desc(familyStreaks.activityDate))
      .limit(60);

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    for (const s of streaks) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - currentStreak);
      if (new Date(s.activityDate).toISOString().split("T")[0] === expected.toISOString().split("T")[0]) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Total XP calculation (tasks * xp_reward)
    const xpResult = await db
      .select({ totalXp: sql<number>`COALESCE(SUM(xp_reward), 0)` })
      .from(familyTasks)
      .where(and(eq(familyTasks.childId, req.params.childId), eq(familyTasks.status, "completed")));
    const totalXp = Number(xpResult[0]?.totalXp || 0);
    const level = Math.floor(totalXp / 100) + 1;

    res.json({ currentStreak, totalXp, level, recentStreaks: streaks.slice(0, 30) });
  } catch (err) {
    handleError(res, err, "Failed to fetch streaks");
  }
});

// ─── ENGAGEMENT SCORES ───

// GET /children/:childId/engagement?weekStart=
familyAcademicRouter.get("/children/:childId/engagement", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const weekStart = req.query.weekStart as string | undefined;
    const conditions = [eq(familyEngagementScores.childId, req.params.childId), eq(familyEngagementScores.parentUserId, userId)];
    if (weekStart) conditions.push(eq(familyEngagementScores.weekStart, weekStart));
    const scores = await db
      .select()
      .from(familyEngagementScores)
      .where(and(...conditions))
      .orderBy(desc(familyEngagementScores.weekStart))
      .limit(12);
    res.json(scores);
  } catch (err) {
    handleError(res, err, "Failed to fetch engagement scores");
  }
});

// POST /children/:childId/engagement/calculate — recalculate engagement for current week
familyAcademicRouter.post("/children/:childId/engagement/calculate", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const childId = req.params.childId;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = new Date(weekStart.getTime() + 7 * 86400000).toISOString().split("T")[0];

    // Get goals for target values
    const goals = await db.select().from(familyStudyGoals)
      .where(and(eq(familyStudyGoals.childId, childId), eq(familyStudyGoals.isActive, true)));
    const sessionsTarget = goals.find(g => g.goalType === "sessions_per_week")?.targetValue ?? 3;
    const minutesTarget = (goals.find(g => g.goalType === "minutes_per_day")?.targetValue ?? 30) * 7;

    // Count tasks
    const allTasks = await db.select().from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), gte(familyTasks.dueDate, weekStartStr), lte(familyTasks.dueDate, weekEndStr)));
    const tasksCompleted = allTasks.filter(t => t.status === "completed").length;
    const tasksPending = allTasks.filter(t => t.status === "pending").length;
    const tasksMissed = allTasks.filter(t => t.status === "missed").length;

    // Streaks this week
    const weekStreaks = await db.select().from(familyStreaks)
      .where(and(eq(familyStreaks.childId, childId), gte(familyStreaks.activityDate, weekStartStr), lte(familyStreaks.activityDate, weekEndStr)));
    const activeDays = weekStreaks.length;
    const sessionsCompleted = weekStreaks.filter(s => s.hadSession).length;
    const totalStudyMinutes = weekStreaks.reduce((sum, s) => sum + (s.studyMinutes || 0), 0);

    const { score, riskLevel } = calculateEngagementScore({
      sessionsCompleted,
      sessionsTarget,
      tasksCompleted,
      tasksTotal: allTasks.length,
      studyMinutes: totalStudyMinutes,
      studyMinutesTarget: minutesTarget,
      activeDays,
    });

    // Determine trend from previous week
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const prevScores = await db.select().from(familyEngagementScores)
      .where(and(eq(familyEngagementScores.childId, childId), eq(familyEngagementScores.weekStart, prevWeekStart)))
      .limit(1);
    const prevScore = prevScores[0] ? Number(prevScores[0].engagementScore) : score;
    const trend = score > prevScore ? "improving" : score < prevScore ? "declining" : "stable";

    // Upsert engagement score
    const existing = await db.select().from(familyEngagementScores)
      .where(and(eq(familyEngagementScores.childId, childId), eq(familyEngagementScores.weekStart, weekStartStr)))
      .limit(1);

    let result;
    if (existing.length > 0) {
      [result] = await db.update(familyEngagementScores)
        .set({ sessionsCompleted, tasksCompleted, tasksPending, tasksMissed, totalStudyMinutes, engagementScore: String(score), trend, riskLevel })
        .where(eq(familyEngagementScores.id, existing[0].id))
        .returning();
    } else {
      [result] = await db.insert(familyEngagementScores)
        .values({ childId, parentUserId: userId, weekStart: weekStartStr, sessionsCompleted, tasksCompleted, tasksPending, tasksMissed, totalStudyMinutes, engagementScore: String(score), trend, riskLevel })
        .returning();
    }

    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to calculate engagement");
  }
});

// ─── REMINDERS ───

// GET /children/:childId/reminders
familyAcademicRouter.get("/children/:childId/reminders", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const reminders = await db
      .select()
      .from(familyReminders)
      .where(and(eq(familyReminders.childId, req.params.childId), eq(familyReminders.parentUserId, userId)))
      .orderBy(asc(familyReminders.reminderDate));
    res.json(reminders);
  } catch (err) {
    handleError(res, err, "Failed to fetch reminders");
  }
});

// POST /children/:childId/reminders
familyAcademicRouter.post("/children/:childId/reminders", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyReminderSchema.parse({ ...req.body, childId: req.params.childId, parentUserId: userId });
    const [reminder] = await db.insert(familyReminders).values(data).returning();
    res.status(201).json(reminder);
  } catch (err) {
    handleError(res, err, "Failed to create reminder");
  }
});

// ─── FAMILY DASHBOARD SUMMARY ───

// GET /dashboard — aggregated family overview for the parent
familyAcademicRouter.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const children = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, userId), eq(familyChildren.isActive, true)))
      .orderBy(asc(familyChildren.createdAt));

    const today = new Date().toISOString().split("T")[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = new Date(weekStart.getTime() + 7 * 86400000).toISOString().split("T")[0];

    const childSummaries = await Promise.all(
      children.map(async (child) => {
        // Pending tasks
        const pendingTasks = await db.select({ count: sql<number>`count(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "pending")));

        // Next deadline
        const nextEvent = await db.select().from(familyCalendarEvents)
          .where(and(eq(familyCalendarEvents.childId, child.id), gte(familyCalendarEvents.startDate, today)))
          .orderBy(asc(familyCalendarEvents.startDate))
          .limit(1);

        // Current engagement
        const engagement = await db.select().from(familyEngagementScores)
          .where(eq(familyEngagementScores.childId, child.id))
          .orderBy(desc(familyEngagementScores.weekStart))
          .limit(1);

        // Streak
        const streaks = await db.select().from(familyStreaks)
          .where(eq(familyStreaks.childId, child.id))
          .orderBy(desc(familyStreaks.activityDate))
          .limit(60);
        let currentStreak = 0;
        const todayDate = new Date();
        for (const s of streaks) {
          const expected = new Date(todayDate);
          expected.setDate(expected.getDate() - currentStreak);
          if (new Date(s.activityDate).toISOString().split("T")[0] === expected.toISOString().split("T")[0]) {
            currentStreak++;
          } else break;
        }

        // XP and level
        const xpResult = await db.select({ totalXp: sql<number>`COALESCE(SUM(xp_reward), 0)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "completed")));
        const totalXp = Number(xpResult[0]?.totalXp || 0);

        // Goals
        const goals = await db.select().from(familyStudyGoals)
          .where(and(eq(familyStudyGoals.childId, child.id), eq(familyStudyGoals.isActive, true)));

        return {
          ...child,
          pendingTaskCount: Number(pendingTasks[0]?.count || 0),
          nextDeadline: nextEvent[0] || null,
          engagementScore: engagement[0] ? Number(engagement[0].engagementScore) : null,
          riskLevel: engagement[0]?.riskLevel || null,
          trend: engagement[0]?.trend || null,
          currentStreak,
          totalXp,
          level: Math.floor(totalXp / 100) + 1,
          goals,
        };
      }),
    );

    // This Week summary
    const allWeekTasks = await db.select().from(familyTasks)
      .where(and(eq(familyTasks.parentUserId, userId), gte(familyTasks.dueDate, weekStartStr), lte(familyTasks.dueDate, weekEndStr)));
    const weekStreaks = await db.select().from(familyStreaks)
      .where(
        and(
          sql`${familyStreaks.childId} IN (SELECT id FROM family_children WHERE parent_user_id = ${userId} AND is_active = true)`,
          gte(familyStreaks.activityDate, weekStartStr),
          lte(familyStreaks.activityDate, weekEndStr),
        ),
      );
    const upcomingDeadlines = await db.select({ count: sql<number>`count(*)` }).from(familyCalendarEvents)
      .where(and(eq(familyCalendarEvents.parentUserId, userId), gte(familyCalendarEvents.startDate, today), lte(familyCalendarEvents.startDate, weekEndStr)));

    const isSummerMode = (() => {
      const month = new Date().getMonth() + 1;
      return month >= 6 && month <= 8;
    })();

    res.json({
      children: childSummaries,
      thisWeek: {
        totalStudyHours: Math.round(weekStreaks.reduce((sum, s) => sum + (s.studyMinutes || 0), 0) / 60 * 10) / 10,
        tasksCompleted: allWeekTasks.filter(t => t.status === "completed").length,
        upcomingDeadlines: Number(upcomingDeadlines[0]?.count || 0),
      },
      isSummerMode,
    });
  } catch (err) {
    handleError(res, err, "Failed to fetch family dashboard");
  }
});

// ─── CHILD DASHBOARD ───

// GET /children/:childId/dashboard — child's own dashboard data
familyAcademicRouter.get("/children/:childId/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const childId = req.params.childId;

    const [child] = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.id, childId), eq(familyChildren.parentUserId, userId)));
    if (!child) return res.status(404).json({ message: "Child not found" });

    const today = new Date().toISOString().split("T")[0];

    // Today's tasks
    const todayTasks = await db.select().from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), eq(familyTasks.dueDate, today)))
      .orderBy(asc(familyTasks.priority));

    // Upcoming tasks
    const upcomingTasks = await db.select().from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), sql`${familyTasks.dueDate} > ${today}`, eq(familyTasks.status, "pending")))
      .orderBy(asc(familyTasks.dueDate))
      .limit(10);

    // Overdue tasks
    const overdueTasks = await db.select().from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), sql`${familyTasks.dueDate} < ${today}`, eq(familyTasks.status, "pending")))
      .orderBy(asc(familyTasks.dueDate));

    // Upcoming events
    const upcomingEvents = await db.select().from(familyCalendarEvents)
      .where(and(eq(familyCalendarEvents.childId, childId), gte(familyCalendarEvents.startDate, today)))
      .orderBy(asc(familyCalendarEvents.startDate))
      .limit(5);

    // Achievements
    const achievements = await db.select().from(familyAchievements)
      .where(eq(familyAchievements.childId, childId))
      .orderBy(desc(familyAchievements.earnedAt));

    // Streak + XP + Level
    const streaks = await db.select().from(familyStreaks)
      .where(eq(familyStreaks.childId, childId))
      .orderBy(desc(familyStreaks.activityDate))
      .limit(60);
    let currentStreak = 0;
    const todayDate = new Date();
    for (const s of streaks) {
      const expected = new Date(todayDate);
      expected.setDate(expected.getDate() - currentStreak);
      if (new Date(s.activityDate).toISOString().split("T")[0] === expected.toISOString().split("T")[0]) {
        currentStreak++;
      } else break;
    }

    const xpResult = await db.select({ totalXp: sql<number>`COALESCE(SUM(xp_reward), 0)` }).from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), eq(familyTasks.status, "completed")));
    const totalXp = Number(xpResult[0]?.totalXp || 0);

    // Goals progress
    const goals = await db.select().from(familyStudyGoals)
      .where(and(eq(familyStudyGoals.childId, childId), eq(familyStudyGoals.isActive, true)));

    // Engagement
    const engagement = await db.select().from(familyEngagementScores)
      .where(eq(familyEngagementScores.childId, childId))
      .orderBy(desc(familyEngagementScores.weekStart))
      .limit(1);

    // Determine age-appropriate style
    const gradeNum = parseGradeNumber(child.gradeLevel);
    const styleMode = gradeNum <= 5 ? "elementary" : gradeNum <= 8 ? "middle" : "high";

    res.json({
      child,
      styleMode,
      todayTasks,
      upcomingTasks,
      overdueTasks,
      upcomingEvents,
      achievements,
      currentStreak,
      totalXp,
      level: Math.floor(totalXp / 100) + 1,
      goals,
      engagement: engagement[0] || null,
    });
  } catch (err) {
    handleError(res, err, "Failed to fetch child dashboard");
  }
});

function parseGradeNumber(gradeLevel: string | null): number {
  if (!gradeLevel) return 6;
  const lower = gradeLevel.toLowerCase();
  if (lower.includes("k") || lower === "kindergarten") return 0;
  const match = lower.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 6;
}

// ─── WEEKLY REPORTS ───

// GET /children/:childId/weekly-report?weekStart=
familyAcademicRouter.get("/children/:childId/weekly-report", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const weekStart = req.query.weekStart as string | undefined;
    const conditions = [eq(familyWeeklyReports.childId, req.params.childId), eq(familyWeeklyReports.parentUserId, userId)];
    if (weekStart) conditions.push(eq(familyWeeklyReports.weekStart, weekStart));
    const reports = await db.select().from(familyWeeklyReports)
      .where(and(...conditions))
      .orderBy(desc(familyWeeklyReports.weekStart))
      .limit(4);
    res.json(reports);
  } catch (err) {
    handleError(res, err, "Failed to fetch weekly reports");
  }
});

// ─── FAMILY LEADERBOARD ───

// GET /leaderboard — weekly XP ranking among siblings
familyAcademicRouter.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = new Date(weekStart.getTime() + 7 * 86400000).toISOString().split("T")[0];

    const children = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, userId), eq(familyChildren.isActive, true)));

    const leaderboard = await Promise.all(
      children.map(async (child) => {
        const xpResult = await db
          .select({ weeklyXp: sql<number>`COALESCE(SUM(xp_reward), 0)` })
          .from(familyTasks)
          .where(and(
            eq(familyTasks.childId, child.id),
            eq(familyTasks.status, "completed"),
            gte(familyTasks.completedAt, new Date(weekStartStr)),
            lte(familyTasks.completedAt, new Date(weekEndStr)),
          ));
        return {
          childId: child.id,
          childName: child.childName,
          avatarEmoji: child.avatarEmoji,
          weeklyXp: Number(xpResult[0]?.weeklyXp || 0),
        };
      }),
    );

    leaderboard.sort((a, b) => b.weeklyXp - a.weeklyXp);
    res.json(leaderboard);
  } catch (err) {
    handleError(res, err, "Failed to fetch leaderboard");
  }
});

// ============ VOICE INTEGRATION ============

/**
 * Build context string for voice tutoring sessions.
 * Appended to the system instruction when a child starts a study session.
 */
export async function getFamilyAcademicContextForVoice(userId: string, childId: string): Promise<string> {
  try {
    const [child] = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.id, childId), eq(familyChildren.parentUserId, userId)));
    if (!child) return "";

    const today = new Date().toISOString().split("T")[0];
    const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    // Upcoming tests/quizzes within 7 days
    const upcomingEvents = await db.select().from(familyCalendarEvents)
      .where(and(
        eq(familyCalendarEvents.childId, childId),
        gte(familyCalendarEvents.startDate, today),
        lte(familyCalendarEvents.startDate, sevenDaysOut),
      ))
      .orderBy(asc(familyCalendarEvents.startDate));

    // Active/overdue tasks
    const activeTasks = await db.select().from(familyTasks)
      .where(and(
        eq(familyTasks.childId, childId),
        or(eq(familyTasks.status, "pending"), eq(familyTasks.dueDate, today)),
      ))
      .orderBy(asc(familyTasks.dueDate))
      .limit(10);

    // Streak
    const streaks = await db.select().from(familyStreaks)
      .where(eq(familyStreaks.childId, childId))
      .orderBy(desc(familyStreaks.activityDate))
      .limit(60);
    let currentStreak = 0;
    const todayDate = new Date();
    for (const s of streaks) {
      const expected = new Date(todayDate);
      expected.setDate(expected.getDate() - currentStreak);
      if (new Date(s.activityDate).toISOString().split("T")[0] === expected.toISOString().split("T")[0]) {
        currentStreak++;
      } else break;
    }

    // Goals
    const goals = await db.select().from(familyStudyGoals)
      .where(and(eq(familyStudyGoals.childId, childId), eq(familyStudyGoals.isActive, true)));

    // Courses
    const courses = await db.select().from(familyCourses)
      .where(and(eq(familyCourses.childId, childId), eq(familyCourses.isActive, true)));

    // Build context
    const gradeNum = parseGradeNumber(child.gradeLevel);
    let personalityNote = "";
    if (gradeNum <= 5) personalityNote = "Use very encouraging, simple language. Celebrate small wins.";
    else if (gradeNum <= 8) personalityNote = "Be encouraging but structured. Introduce academic vocabulary.";
    else personalityNote = "Be professional. Treat them like a young adult. Focus on reasoning.";

    const lines: string[] = [
      `\n━━━ FAMILY ACADEMIC CONTEXT ━━━`,
      `Student: ${child.childName}${child.childAge ? `, age ${child.childAge}` : ""}${child.gradeLevel ? `, grade ${child.gradeLevel}` : ""}`,
      personalityNote,
    ];

    if (courses.length > 0) {
      lines.push(`Courses: ${courses.map(c => c.courseName).join(", ")}`);
    }

    if (upcomingEvents.length > 0) {
      lines.push(`Upcoming (next 7 days):`);
      for (const e of upcomingEvents.slice(0, 5)) {
        lines.push(`  - ${e.title} (${e.eventType || "event"}) on ${e.startDate}`);
      }
    }

    if (activeTasks.length > 0) {
      const overdue = activeTasks.filter(t => t.dueDate && t.dueDate < today);
      const dueTodayTasks = activeTasks.filter(t => t.dueDate === today);
      if (overdue.length > 0) lines.push(`OVERDUE: ${overdue.map(t => t.title).join(", ")}`);
      if (dueTodayTasks.length > 0) lines.push(`Due today: ${dueTodayTasks.map(t => t.title).join(", ")}`);
    }

    if (currentStreak > 0) {
      lines.push(`Current streak: ${currentStreak} day${currentStreak !== 1 ? "s" : ""} 🔥 — encourage them!`);
    }

    if (goals.length > 0) {
      for (const g of goals) {
        lines.push(`Goal: ${g.goalType} — ${g.currentValue}/${g.targetValue}`);
      }
    }

    // Summer mode
    const month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 8 && courses.length === 0) {
      lines.push(`It's summer! Open with: "It's summer! Want to keep your skills sharp?"`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join("\n");
  } catch (err) {
    console.error("[Family Academic] Voice context generation failed:", err);
    return "";
  }
}

// ============ ADMIN ROUTER ============

export const familyAcademicAdminRouter = Router();

// GET /api/admin/family-academic/overview — aggregate stats for all families
familyAcademicAdminRouter.get("/overview", async (req: Request, res: Response) => {
  try {
    const totalChildren = await db.select({ count: sql<number>`count(*)` }).from(familyChildren).where(eq(familyChildren.isActive, true));
    const totalCourses = await db.select({ count: sql<number>`count(*)` }).from(familyCourses).where(eq(familyCourses.isActive, true));
    const totalEvents = await db.select({ count: sql<number>`count(*)` }).from(familyCalendarEvents);
    const totalTasks = await db.select({ count: sql<number>`count(*)` }).from(familyTasks);
    const completedTasks = await db.select({ count: sql<number>`count(*)` }).from(familyTasks).where(eq(familyTasks.status, "completed"));
    const totalAchievements = await db.select({ count: sql<number>`count(*)` }).from(familyAchievements);
    const parentCount = await db.select({ count: sql<number>`count(DISTINCT parent_user_id)` }).from(familyChildren).where(eq(familyChildren.isActive, true));

    // At-risk children
    const atRisk = await db.select({ count: sql<number>`count(*)` }).from(familyEngagementScores)
      .where(or(eq(familyEngagementScores.riskLevel, "at_risk"), eq(familyEngagementScores.riskLevel, "critical")));

    res.json({
      totalFamilies: Number(parentCount[0]?.count || 0),
      totalChildren: Number(totalChildren[0]?.count || 0),
      totalCourses: Number(totalCourses[0]?.count || 0),
      totalEvents: Number(totalEvents[0]?.count || 0),
      totalTasks: Number(totalTasks[0]?.count || 0),
      completedTasks: Number(completedTasks[0]?.count || 0),
      totalAchievements: Number(totalAchievements[0]?.count || 0),
      atRiskChildren: Number(atRisk[0]?.count || 0),
    });
  } catch (err) {
    handleError(res, err, "Failed to fetch admin overview");
  }
});

// GET /api/admin/family-academic/families — list all families with children
familyAcademicAdminRouter.get("/families", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id as parent_id, u.username, u.email, u.first_name, u.last_name,
        COUNT(DISTINCT fc.id) as child_count,
        COUNT(DISTINCT ft.id) FILTER (WHERE ft.status = 'completed') as tasks_completed,
        COUNT(DISTINCT ft.id) as total_tasks
      FROM users u
      JOIN family_children fc ON fc.parent_user_id = u.id AND fc.is_active = true
      LEFT JOIN family_tasks ft ON ft.parent_user_id = u.id
      GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
      ORDER BY child_count DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Failed to fetch families");
  }
});

// GET /api/admin/family-academic/at-risk — children at risk
familyAcademicAdminRouter.get("/at-risk", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        fc.id as child_id, fc.child_name, fc.grade_level, fc.avatar_emoji,
        u.username as parent_username, u.email as parent_email,
        fes.engagement_score, fes.risk_level, fes.trend, fes.week_start
      FROM family_engagement_scores fes
      JOIN family_children fc ON fc.id = fes.child_id
      JOIN users u ON u.id = fes.parent_user_id
      WHERE fes.risk_level IN ('at_risk', 'critical')
      AND fes.week_start = (SELECT MAX(week_start) FROM family_engagement_scores WHERE child_id = fes.child_id)
      ORDER BY fes.engagement_score ASC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, "Failed to fetch at-risk children");
  }
});

export default familyAcademicRouter;
