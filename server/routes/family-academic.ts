/**
 * Family Academic Command Center Routes
 * Full CRUD for family children, courses, calendar events, tasks, reminders, goals
 * Auto-generated study tasks, engagement scoring, gamification, weekly reports
 * Mounted at /api/family-academic (user) and /api/admin/family-academic (admin)
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { eq, and, desc, asc, sql, gte, lte, or, ne } from "drizzle-orm";
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
  users,
  students,
  insertFamilyChildSchema,
  insertFamilyCourseSchema,
  insertFamilyCalendarEventSchema,
  insertFamilyTaskSchema,
  insertFamilyReminderSchema,
  insertFamilyStudyGoalSchema,
  FAMILY_XP,
  FAMILY_STREAK_BADGES,
  FAMILY_ACHIEVEMENTS,
  calculateFamilyXpLevel,
  calculateFamilyEngagement,
} from "@shared/schema";

// ============ HELPERS ============

const requireAuth = (req: Request, res: Response, next: any) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

function getUserId(req: Request): string {
  return (req.user as any).id;
}

function handleError(res: Response, err: unknown, context = "Operation failed") {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: err.errors });
  }
  console.error(`[Family Academic] ${context}:`, err);
  return res.status(500).json({ message: context });
}

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0];
}

function isSummerMode(): boolean {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 8;
}

// ============ AUTO TASK GENERATION ============

async function generateStudyTasks(
  event: { id: string; childId: string; parentUserId: string; courseId: string | null; title: string; eventType: string | null; startDate: string }
) {
  const eventDate = new Date(event.startDate);
  const tasks: Array<{
    childId: string;
    parentUserId: string;
    courseId: string | null;
    eventId: string;
    title: string;
    taskType: string;
    dueDate: string;
    priority: string;
    estimatedMinutes: number;
    xpReward: number;
  }> = [];

  const addTask = (daysBefore: number, title: string, priority: string, minutes: number, xp: number) => {
    const due = new Date(eventDate);
    due.setDate(due.getDate() - daysBefore);
    if (due >= new Date()) {
      tasks.push({
        childId: event.childId,
        parentUserId: event.parentUserId,
        courseId: event.courseId,
        eventId: event.id,
        title,
        taskType: "auto_study",
        dueDate: due.toISOString().split("T")[0],
        priority,
        estimatedMinutes: minutes,
        xpReward: xp,
      });
    }
  };

  const type = (event.eventType || "").toLowerCase();

  if (type === "test" || type === "exam") {
    addTask(7, `Start reviewing for ${event.title}`, "medium", 30, 10);
    addTask(5, `Continue review: ${event.title}`, "medium", 30, 10);
    addTask(3, `Practice session for ${event.title}`, "high", 45, 15);
    addTask(1, `Final review: ${event.title} tomorrow!`, "high", 30, 15);
  } else if (type === "homework" || type === "project") {
    addTask(3, `Work on ${event.title}`, "medium", 30, 10);
    addTask(1, `Finish ${event.title} — due tomorrow!`, "high", 30, 10);
  } else if (type === "quiz") {
    addTask(3, `Review for ${event.title}`, "medium", 20, 10);
    addTask(1, `Quick review: ${event.title} tomorrow`, "high", 15, 10);
  }

  if (tasks.length > 0) {
    await db.insert(familyTasks).values(tasks);
  }

  return tasks.length;
}

// ============ AUTO REMINDER GENERATION ============

async function generateReminders(
  event: { id: string; childId: string; parentUserId: string; title: string; eventType: string | null; startDate: string }
) {
  const eventDate = new Date(event.startDate);
  const now = new Date();
  const reminders: Array<{
    childId: string;
    parentUserId: string;
    eventId: string;
    reminderType: string;
    reminderDate: string;
    message: string;
    deliveryMethod: string;
  }> = [];

  function subDays(date: Date, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  }

  function isFuture(dateStr: string): boolean {
    return new Date(dateStr) >= now;
  }

  const type = (event.eventType || "").toLowerCase();
  if (type === "test" || type === "exam") {
    const d7 = subDays(eventDate, 7);
    const d3 = subDays(eventDate, 3);
    const d1 = subDays(eventDate, 1);
    if (isFuture(d7)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "exam_7day", reminderDate: d7, message: `${event.title} is in 7 days — start reviewing!`, deliveryMethod: "both" });
    if (isFuture(d3)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "exam_3day", reminderDate: d3, message: `${event.title} is in 3 days — time for intensive review`, deliveryMethod: "both" });
    if (isFuture(d1)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "exam_1day", reminderDate: d1, message: `${event.title} is tomorrow — final review time!`, deliveryMethod: "both" });
  } else if (type === "homework" || type === "assignment" || type === "project") {
    const d3 = subDays(eventDate, 3);
    const d1 = subDays(eventDate, 1);
    if (isFuture(d3)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "assignment_3day", reminderDate: d3, message: `${event.title} is due in 3 days`, deliveryMethod: "in_app" });
    if (isFuture(d1)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "assignment_1day", reminderDate: d1, message: `${event.title} is due tomorrow!`, deliveryMethod: "both" });
  } else if (type === "quiz") {
    const d3 = subDays(eventDate, 3);
    const d1 = subDays(eventDate, 1);
    if (isFuture(d3)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "study_reminder", reminderDate: d3, message: `${event.title} is in 3 days — review time`, deliveryMethod: "in_app" });
    if (isFuture(d1)) reminders.push({ childId: event.childId, parentUserId: event.parentUserId, eventId: event.id, reminderType: "study_reminder", reminderDate: d1, message: `${event.title} is tomorrow!`, deliveryMethod: "both" });
  }

  if (reminders.length > 0) {
    await db.insert(familyReminders).values(reminders);
  }

  return reminders.length;
}

// ============ STREAK / ACHIEVEMENT HELPERS ============

async function updateStreak(childId: string, type: "session" | "task") {
  const today = new Date().toISOString().split("T")[0];
  const existing = await db
    .select()
    .from(familyStreaks)
    .where(and(eq(familyStreaks.childId, childId), eq(familyStreaks.activityDate, today)))
    .limit(1);

  if (existing.length > 0) {
    const updates: any = {};
    if (type === "session") updates.hadSession = true;
    if (type === "task") updates.hadTaskCompletion = true;
    await db.update(familyStreaks).set(updates).where(eq(familyStreaks.id, existing[0].id));
  } else {
    await db.insert(familyStreaks).values({
      childId,
      activityDate: today,
      hadSession: type === "session",
      hadTaskCompletion: type === "task",
    });
  }
}

async function getCurrentStreak(childId: string): Promise<number> {
  const streaks = await db
    .select()
    .from(familyStreaks)
    .where(eq(familyStreaks.childId, childId))
    .orderBy(desc(familyStreaks.activityDate))
    .limit(60);

  let count = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < streaks.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expStr = expected.toISOString().split("T")[0];

    if (streaks[i].activityDate === expStr && (streaks[i].hadSession || streaks[i].hadTaskCompletion)) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

async function getChildTotalXp(childId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${familyTasks.xpReward}), 0)` })
    .from(familyTasks)
    .where(and(eq(familyTasks.childId, childId), eq(familyTasks.status, "completed")));
  return Number(result[0]?.total ?? 0);
}

async function checkAndAwardAchievements(childId: string) {
  const existing = await db.select().from(familyAchievements).where(eq(familyAchievements.childId, childId));
  const earned = new Set(existing.map((a) => a.achievementType));
  const newAchievements: Array<{ childId: string; achievementType: string; achievementName: string; achievementEmoji: string }> = [];

  // Task Machine (50 tasks)
  if (!earned.has("task_machine")) {
    const count = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(familyTasks)
      .where(and(eq(familyTasks.childId, childId), eq(familyTasks.status, "completed")));
    if (Number(count[0].count) >= 50) {
      newAchievements.push({ childId, achievementType: "task_machine", achievementName: "Task Machine", achievementEmoji: "⚙️" });
    }
  }

  // Streak Master (30 days)
  if (!earned.has("streak_master")) {
    const streak = await getCurrentStreak(childId);
    if (streak >= 30) {
      newAchievements.push({ childId, achievementType: "streak_master", achievementName: "Streak Master", achievementEmoji: "🏅" });
    }
  }

  // Summer Scholar
  if (!earned.has("summer_scholar") && isSummerMode()) {
    const summerStreaks = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(familyStreaks)
      .where(and(eq(familyStreaks.childId, childId), gte(familyStreaks.activityDate, `${new Date().getFullYear()}-06-01`)));
    if (Number(summerStreaks[0].count) >= 1) {
      newAchievements.push({ childId, achievementType: "summer_scholar", achievementName: "Summer Scholar", achievementEmoji: "☀️" });
    }
  }

  if (newAchievements.length > 0) {
    await db.insert(familyAchievements).values(newAchievements);
  }

  return newAchievements;
}

// ============ VOICE TUTOR INTEGRATION ============

export async function getFamilyAcademicContextForVoice(userId: string, childId: string): Promise<string> {
  try {
    const child = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.id, childId), eq(familyChildren.parentUserId, userId)))
      .limit(1);

    if (!child.length) return "";

    const c = child[0];
    const now = new Date();
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const todayStr = now.toISOString().split("T")[0];
    const weekStr = weekFromNow.toISOString().split("T")[0];

    const [upcomingTests, overdueTasks, activeTasks, goals, streakCount] = await Promise.all([
      db.select().from(familyCalendarEvents)
        .where(and(
          eq(familyCalendarEvents.childId, childId),
          gte(familyCalendarEvents.startDate, todayStr),
          lte(familyCalendarEvents.startDate, weekStr),
          or(eq(familyCalendarEvents.eventType, "test"), eq(familyCalendarEvents.eventType, "quiz"))
        ))
        .orderBy(asc(familyCalendarEvents.startDate))
        .limit(5),
      db.select().from(familyTasks)
        .where(and(
          eq(familyTasks.childId, childId),
          eq(familyTasks.status, "pending"),
          lte(familyTasks.dueDate, todayStr)
        ))
        .limit(5),
      db.select().from(familyTasks)
        .where(and(
          eq(familyTasks.childId, childId),
          eq(familyTasks.status, "pending"),
          gte(familyTasks.dueDate, todayStr)
        ))
        .orderBy(asc(familyTasks.dueDate))
        .limit(5),
      db.select().from(familyStudyGoals)
        .where(and(eq(familyStudyGoals.childId, childId), eq(familyStudyGoals.isActive, true))),
      getCurrentStreak(childId),
    ]);

    let gradePersonality = "";
    const grade = (c.gradeLevel || "").toLowerCase();
    if (grade.includes("k") || grade.includes("1") || grade.includes("2") || grade.includes("3") || grade.includes("4") || grade.includes("5")) {
      gradePersonality = "Use very encouraging, simple language. Celebrate small wins enthusiastically!";
    } else if (grade.includes("6") || grade.includes("7") || grade.includes("8")) {
      gradePersonality = "Be encouraging but structured. Introduce academic vocabulary gradually.";
    } else {
      gradePersonality = "Be professional and treat them like a young adult. Focus on reasoning and analysis.";
    }

    const lines: string[] = [
      `\n━━━ FAMILY ACADEMIC CONTEXT ━━━`,
      `Student: ${c.childName} | Grade: ${c.gradeLevel || "Not set"} | Age: ${c.childAge || "Not set"}`,
      `Current Streak: ${streakCount} days ${streakCount >= 7 ? "⭐" : streakCount >= 3 ? "🔥" : ""}`,
      gradePersonality,
    ];

    if (upcomingTests.length > 0) {
      lines.push(`\nUpcoming Tests/Quizzes (next 7 days):`);
      upcomingTests.forEach((t) => lines.push(`  - ${t.title} on ${t.startDate}`));
    }

    if (overdueTasks.length > 0) {
      lines.push(`\n⚠️ Overdue Tasks:`);
      overdueTasks.forEach((t) => lines.push(`  - ${t.title} (was due ${t.dueDate})`));
    }

    if (activeTasks.length > 0) {
      lines.push(`\nActive Study Tasks:`);
      activeTasks.forEach((t) => lines.push(`  - ${t.title} (due ${t.dueDate})`));
    }

    if (goals.length > 0) {
      lines.push(`\nParent-Set Goals:`);
      goals.forEach((g) => lines.push(`  - ${g.goalType}: ${g.currentValue}/${g.targetValue}`));
    }

    if (isSummerMode()) {
      lines.push(`\n☀️ SUMMER MODE: It's summer! Encourage review and skill-building.`);
    }

    lines.push(`━━━ END FAMILY CONTEXT ━━━\n`);

    return lines.join("\n");
  } catch (error) {
    console.error("[Family Academic] Voice context generation failed:", error);
    return "";
  }
}

// ============ USER ROUTES ============

export const familyAcademicRouter = Router();
familyAcademicRouter.use(requireAuth);

// --- Children CRUD ---
familyAcademicRouter.get("/children", async (req, res) => {
  try {
    const children = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, getUserId(req)), eq(familyChildren.isActive, true)))
      .orderBy(asc(familyChildren.childName));
    res.json(children);
  } catch (err) { handleError(res, err, "Failed to fetch children"); }
});

familyAcademicRouter.post("/children", async (req, res) => {
  try {
    const userId = getUserId(req);
    const data = insertFamilyChildSchema.parse({ ...req.body, parentUserId: userId });
    
    // Map grade level text to grade band for tutor profile
    const gradeBandMap: Record<string, string> = {
      "Kindergarten": "k-2", "1st": "k-2", "2nd": "k-2",
      "3rd": "3-5", "4th": "3-5", "5th": "3-5",
      "6th": "6-8", "7th": "6-8", "8th": "6-8",
      "9th": "9-12", "10th": "9-12", "11th": "9-12", "12th": "9-12",
    };
    const gradeBand = gradeBandMap[data.gradeLevel || ""] || "6-8";
    
    // Auto-create a linked student (tutor) profile
    const [studentProfile] = await db.insert(students).values({
      ownerUserId: userId,
      name: data.childName,
      gradeBand,
      age: data.childAge || null,
      avatarType: "default",
    }).returning();
    
    // Create family child linked to the student profile
    const [child] = await db.insert(familyChildren).values({
      ...data,
      studentId: studentProfile.id,
    }).returning();
    
    console.log(`[Family] Created child "${data.childName}" linked to student profile ${studentProfile.id}`);
    res.status(201).json(child);
  } catch (err) { handleError(res, err, "Failed to create child"); }
});

familyAcademicRouter.patch("/children/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const [child] = await db.update(familyChildren)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(familyChildren.id, req.params.id), eq(familyChildren.parentUserId, userId)))
      .returning();
    if (!child) return res.status(404).json({ message: "Child not found" });
    
    // Sync changes back to linked student profile
    if (child.studentId) {
      const syncData: Record<string, any> = { updatedAt: new Date() };
      if (req.body.childName) syncData.name = req.body.childName;
      if (req.body.childAge) syncData.age = req.body.childAge;
      if (req.body.gradeLevel) {
        const gradeBandMap: Record<string, string> = {
          "Kindergarten": "k-2", "1st": "k-2", "2nd": "k-2",
          "3rd": "3-5", "4th": "3-5", "5th": "3-5",
          "6th": "6-8", "7th": "6-8", "8th": "6-8",
          "9th": "9-12", "10th": "9-12", "11th": "9-12", "12th": "9-12",
        };
        syncData.gradeBand = gradeBandMap[req.body.gradeLevel] || "6-8";
      }
      if (req.body.photoUrl) syncData.avatarUrl = req.body.photoUrl;
      await db.update(students).set(syncData).where(eq(students.id, child.studentId));
      console.log(`[Family] Synced profile changes to student ${child.studentId}`);
    }
    
    res.json(child);
  } catch (err) { handleError(res, err, "Failed to update child"); }
});

familyAcademicRouter.delete("/children/:id", async (req, res) => {
  try {
    await db.update(familyChildren)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(familyChildren.id, req.params.id), eq(familyChildren.parentUserId, getUserId(req))));
    res.json({ success: true });
  } catch (err) { handleError(res, err, "Failed to archive child"); }
});

// --- Courses CRUD ---
familyAcademicRouter.get("/children/:childId/courses", async (req, res) => {
  try {
    const courses = await db.select().from(familyCourses)
      .where(and(eq(familyCourses.childId, req.params.childId), eq(familyCourses.parentUserId, getUserId(req))))
      .orderBy(asc(familyCourses.courseName));
    res.json(courses);
  } catch (err) { handleError(res, err, "Failed to fetch courses"); }
});

familyAcademicRouter.post("/children/:childId/courses", async (req, res) => {
  try {
    const data = insertFamilyCourseSchema.parse({
      ...req.body,
      childId: req.params.childId,
      parentUserId: getUserId(req),
    });
    const [course] = await db.insert(familyCourses).values(data).returning();
    res.status(201).json(course);
  } catch (err) { handleError(res, err, "Failed to create course"); }
});

familyAcademicRouter.patch("/courses/:id", async (req, res) => {
  try {
    const [course] = await db.update(familyCourses)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(familyCourses.id, req.params.id), eq(familyCourses.parentUserId, getUserId(req))))
      .returning();
    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json(course);
  } catch (err) { handleError(res, err, "Failed to update course"); }
});

familyAcademicRouter.delete("/courses/:id", async (req, res) => {
  try {
    await db.delete(familyCourses)
      .where(and(eq(familyCourses.id, req.params.id), eq(familyCourses.parentUserId, getUserId(req))));
    res.json({ success: true });
  } catch (err) { handleError(res, err, "Failed to delete course"); }
});

// --- Syllabus Processing with Claude AI ---
familyAcademicRouter.post("/courses/:id/syllabus", async (req, res) => {
  const userId = getUserId(req);
  try {
    const { id } = req.params;
    const { syllabusText } = req.body;
    if (!syllabusText) return res.status(400).json({ error: "syllabusText is required" });

    // Verify course belongs to user
    const [course] = await db.select().from(familyCourses)
      .where(and(eq(familyCourses.id, id), eq(familyCourses.parentUserId, userId)));
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Save syllabus text
    await db.update(familyCourses)
      .set({ syllabusText, syllabusUploadedAt: new Date(), updatedAt: new Date() })
      .where(eq(familyCourses.id, id));

    // Call Claude to extract structured data
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: "You are an academic syllabus parser. Extract structured information from course syllabi. Return ONLY valid JSON, no markdown or explanation.",
      messages: [{
        role: "user",
        content: `Extract the following from this syllabus and return as JSON:
{
  "courseName": "string or null",
  "courseCode": "string or null",
  "instructor": "string or null",
  "events": [
    {
      "title": "string - descriptive name like 'Midterm Exam' or 'Problem Set 3 Due'",
      "eventType": "test|exam|homework|assignment|quiz|project|lab|presentation",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or null",
      "startTime": "HH:MM or null",
      "endTime": "HH:MM or null",
      "description": "string or null",
      "priority": "high|medium|low"
    }
  ]
}

Rules:
- Exams, tests, and midterms are priority "high"
- Assignments, homework, and projects are priority "medium"
- Quizzes are priority "medium"
- If year is not specified, assume 2026
- Include ALL dated events: exams, quizzes, homework, projects, presentations, labs
- Do NOT include weekly recurring events like lectures (only one-off deadlines)
- For events without specific times, leave startTime and endTime as null

Syllabus text:
${syllabusText}`
      }],
    });

    // Parse Claude response
    const textBlock = response.content.find((b: any) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return res.status(500).json({ error: "Failed to parse syllabus" });
    }

    let parsed: any;
    try {
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response as JSON" });
    }

    // Update course with extracted info (only fill in blanks)
    if (parsed.courseName || parsed.courseCode || parsed.instructor) {
      await db.update(familyCourses).set({
        ...(parsed.courseName && !course.courseName && { courseName: parsed.courseName }),
        ...(parsed.instructor && !course.teacherName && { teacherName: parsed.instructor }),
        updatedAt: new Date(),
      }).where(eq(familyCourses.id, id));
    }

    // Create calendar events, study tasks, and reminders
    let eventsCreated = 0;
    let tasksCreated = 0;
    let remindersCreated = 0;

    if (parsed.events && Array.isArray(parsed.events)) {
      for (const evt of parsed.events) {
        if (!evt.title || !evt.startDate) continue;
        const [calEvent] = await db.insert(familyCalendarEvents).values({
          childId: course.childId,
          parentUserId: userId,
          courseId: id,
          title: evt.title,
          eventType: evt.eventType || "custom",
          description: evt.description || null,
          startDate: evt.startDate,
          endDate: evt.endDate || null,
          startTime: evt.startTime || null,
          endTime: evt.endTime || null,
          isFromSchedule: true,
          priority: evt.priority || "medium",
          status: "upcoming",
        }).returning();
        eventsCreated++;

        // Auto-generate study tasks
        const taskCount = await generateStudyTasks({
          id: calEvent.id,
          childId: course.childId,
          parentUserId: userId,
          courseId: id,
          title: calEvent.title,
          eventType: calEvent.eventType,
          startDate: calEvent.startDate,
        });
        tasksCreated += taskCount;

        // Auto-generate reminders
        const reminderCount = await generateReminders({
          id: calEvent.id,
          childId: course.childId,
          parentUserId: userId,
          title: calEvent.title,
          eventType: calEvent.eventType,
          startDate: calEvent.startDate,
        });
        remindersCreated += reminderCount;
      }
    }

    res.json({
      extracted: parsed,
      eventsCreated,
      tasksCreated,
      remindersCreated,
    });
  } catch (error: any) {
    console.error("[Family Academic] Syllabus processing error:", error);
    res.status(500).json({ error: "Failed to process syllabus" });
  }
});

// --- Calendar Events CRUD (with auto-task generation) ---
familyAcademicRouter.get("/events", async (req, res) => {
  try {
    const { childId, startDate, endDate } = req.query;
    let query = db.select().from(familyCalendarEvents)
      .where(eq(familyCalendarEvents.parentUserId, getUserId(req)))
      .orderBy(asc(familyCalendarEvents.startDate));

    const conditions = [eq(familyCalendarEvents.parentUserId, getUserId(req))];
    if (childId) conditions.push(eq(familyCalendarEvents.childId, childId as string));
    if (startDate) conditions.push(gte(familyCalendarEvents.startDate, startDate as string));
    if (endDate) conditions.push(lte(familyCalendarEvents.startDate, endDate as string));

    const events = await db.select().from(familyCalendarEvents)
      .where(and(...conditions))
      .orderBy(asc(familyCalendarEvents.startDate));

    res.json(events);
  } catch (err) { handleError(res, err, "Failed to fetch events"); }
});

familyAcademicRouter.post("/events", async (req, res) => {
  try {
    const data = insertFamilyCalendarEventSchema.parse({ ...req.body, parentUserId: getUserId(req) });
    const [event] = await db.insert(familyCalendarEvents).values(data).returning();

    // Auto-generate study tasks
    const tasksCreated = await generateStudyTasks(event);

    // Auto-generate reminders
    const remindersCreated = await generateReminders(event);

    res.status(201).json({ ...event, autoTasksCreated: tasksCreated, autoRemindersCreated: remindersCreated });
  } catch (err) { handleError(res, err, "Failed to create event"); }
});

familyAcademicRouter.patch("/events/:id", async (req, res) => {
  try {
    const [event] = await db.update(familyCalendarEvents)
      .set(req.body)
      .where(and(eq(familyCalendarEvents.id, req.params.id), eq(familyCalendarEvents.parentUserId, getUserId(req))))
      .returning();
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  } catch (err) { handleError(res, err, "Failed to update event"); }
});

familyAcademicRouter.delete("/events/:id", async (req, res) => {
  try {
    await db.delete(familyCalendarEvents)
      .where(and(eq(familyCalendarEvents.id, req.params.id), eq(familyCalendarEvents.parentUserId, getUserId(req))));
    res.json({ success: true });
  } catch (err) { handleError(res, err, "Failed to delete event"); }
});

// --- Tasks CRUD + Completion ---
familyAcademicRouter.get("/tasks", async (req, res) => {
  try {
    const { childId, status } = req.query;
    const conditions = [eq(familyTasks.parentUserId, getUserId(req))];
    if (childId) conditions.push(eq(familyTasks.childId, childId as string));
    if (status) conditions.push(eq(familyTasks.status, status as string));

    const tasks = await db.select().from(familyTasks)
      .where(and(...conditions))
      .orderBy(asc(familyTasks.dueDate));
    res.json(tasks);
  } catch (err) { handleError(res, err, "Failed to fetch tasks"); }
});

familyAcademicRouter.post("/tasks", async (req, res) => {
  try {
    const data = insertFamilyTaskSchema.parse({ ...req.body, parentUserId: getUserId(req) });
    const [task] = await db.insert(familyTasks).values(data).returning();
    res.status(201).json(task);
  } catch (err) { handleError(res, err, "Failed to create task"); }
});

familyAcademicRouter.post("/tasks/:id/complete", async (req, res) => {
  try {
    const [task] = await db.update(familyTasks)
      .set({ status: "completed", completedAt: new Date(), actualMinutes: req.body.actualMinutes })
      .where(and(eq(familyTasks.id, req.params.id), eq(familyTasks.parentUserId, getUserId(req))))
      .returning();
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Update streak
    await updateStreak(task.childId, "task");

    // Check achievements
    const newAchievements = await checkAndAwardAchievements(task.childId);

    // Get updated XP + streak
    const totalXp = await getChildTotalXp(task.childId);
    const streak = await getCurrentStreak(task.childId);
    const level = calculateFamilyXpLevel(totalXp);

    // Check streak badges
    const newStreakBadges = FAMILY_STREAK_BADGES.filter((b) => streak >= b.days);

    res.json({
      task,
      xpAwarded: task.xpReward,
      totalXp,
      level,
      streak,
      newAchievements,
      streakBadges: newStreakBadges,
    });
  } catch (err) { handleError(res, err, "Failed to complete task"); }
});

familyAcademicRouter.delete("/tasks/:id", async (req, res) => {
  try {
    await db.delete(familyTasks)
      .where(and(eq(familyTasks.id, req.params.id), eq(familyTasks.parentUserId, getUserId(req))));
    res.json({ success: true });
  } catch (err) { handleError(res, err, "Failed to delete task"); }
});

// --- Reminders ---
familyAcademicRouter.get("/reminders", async (req, res) => {
  try {
    const { childId } = req.query;
    const conditions = [eq(familyReminders.parentUserId, getUserId(req))];
    if (childId) conditions.push(eq(familyReminders.childId, childId as string));

    const reminders = await db.select().from(familyReminders)
      .where(and(...conditions))
      .orderBy(asc(familyReminders.reminderDate));
    res.json(reminders);
  } catch (err) { handleError(res, err, "Failed to fetch reminders"); }
});

familyAcademicRouter.post("/reminders", async (req, res) => {
  try {
    const data = insertFamilyReminderSchema.parse({ ...req.body, parentUserId: getUserId(req) });
    const [reminder] = await db.insert(familyReminders).values(data).returning();
    res.status(201).json(reminder);
  } catch (err) { handleError(res, err, "Failed to create reminder"); }
});

// --- Study Goals ---
familyAcademicRouter.get("/goals", async (req, res) => {
  try {
    const { childId } = req.query;
    const conditions = [eq(familyStudyGoals.parentUserId, getUserId(req))];
    if (childId) conditions.push(eq(familyStudyGoals.childId, childId as string));

    const goals = await db.select().from(familyStudyGoals)
      .where(and(...conditions))
      .orderBy(desc(familyStudyGoals.createdAt));
    res.json(goals);
  } catch (err) { handleError(res, err, "Failed to fetch goals"); }
});

familyAcademicRouter.post("/goals", async (req, res) => {
  try {
    const data = insertFamilyStudyGoalSchema.parse({ ...req.body, parentUserId: getUserId(req) });
    const [goal] = await db.insert(familyStudyGoals).values(data).returning();
    res.status(201).json(goal);
  } catch (err) { handleError(res, err, "Failed to create goal"); }
});

familyAcademicRouter.patch("/goals/:id", async (req, res) => {
  try {
    const [goal] = await db.update(familyStudyGoals)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(familyStudyGoals.id, req.params.id), eq(familyStudyGoals.parentUserId, getUserId(req))))
      .returning();
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    res.json(goal);
  } catch (err) { handleError(res, err, "Failed to update goal"); }
});

// --- Child Dashboard Data (single child summary) ---
familyAcademicRouter.get("/children/:childId/dashboard", async (req, res) => {
  try {
    const userId = getUserId(req);
    const childId = req.params.childId;

    const [child] = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.id, childId), eq(familyChildren.parentUserId, userId)));
    if (!child) return res.status(404).json({ message: "Child not found" });

    const todayStr = new Date().toISOString().split("T")[0];
    const weekStart = getMonday(new Date());

    const [
      courses,
      pendingTasks,
      completedTasksThisWeek,
      achievements,
      streak,
      totalXp,
      goals,
      upcomingEvents,
    ] = await Promise.all([
      db.select().from(familyCourses).where(and(eq(familyCourses.childId, childId), eq(familyCourses.isActive, true))),
      db.select().from(familyTasks).where(and(eq(familyTasks.childId, childId), eq(familyTasks.status, "pending"))),
      db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
        .where(and(eq(familyTasks.childId, childId), eq(familyTasks.status, "completed"), gte(familyTasks.completedAt, new Date(weekStart)))),
      db.select().from(familyAchievements).where(eq(familyAchievements.childId, childId)),
      getCurrentStreak(childId),
      getChildTotalXp(childId),
      db.select().from(familyStudyGoals).where(and(eq(familyStudyGoals.childId, childId), eq(familyStudyGoals.isActive, true))),
      db.select().from(familyCalendarEvents)
        .where(and(eq(familyCalendarEvents.childId, childId), gte(familyCalendarEvents.startDate, todayStr)))
        .orderBy(asc(familyCalendarEvents.startDate)).limit(5),
    ]);

    const level = calculateFamilyXpLevel(totalXp);
    const streakBadges = FAMILY_STREAK_BADGES.filter((b) => streak >= b.days);

    // Engagement score for current week
    const activeDaysResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(familyStreaks)
      .where(and(eq(familyStreaks.childId, childId), gte(familyStreaks.activityDate, weekStart)));
    const activeDays = Number(activeDaysResult[0]?.count ?? 0);

    const sessionsTarget = goals.find((g) => g.goalType === "sessions_per_week")?.targetValue ?? 3;
    const engagement = calculateFamilyEngagement({
      sessionsCompleted: 0, // Would need session tracking integration
      sessionsTarget,
      tasksCompleted: Number(completedTasksThisWeek[0]?.count ?? 0),
      totalTasks: pendingTasks.length + Number(completedTasksThisWeek[0]?.count ?? 0),
      studyMinutes: 0,
      recommendedMinutes: (goals.find((g) => g.goalType === "minutes_per_day")?.targetValue ?? 30) * 7,
      activeDays,
    });

    res.json({
      child,
      courses,
      pendingTasks,
      completedTasksThisWeek: Number(completedTasksThisWeek[0]?.count ?? 0),
      achievements,
      streak,
      streakBadges,
      totalXp,
      level,
      goals,
      upcomingEvents,
      engagement,
      isSummerMode: isSummerMode() || courses.length === 0,
    });
  } catch (err) { handleError(res, err, "Failed to fetch child dashboard"); }
});

// --- Family Dashboard (all children summary) ---
familyAcademicRouter.get("/dashboard", async (req, res) => {
  try {
    const userId = getUserId(req);
    const children = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, userId), eq(familyChildren.isActive, true)))
      .orderBy(asc(familyChildren.childName));

    const todayStr = new Date().toISOString().split("T")[0];
    const weekStart = getMonday(new Date());

    const childSummaries = await Promise.all(children.map(async (child) => {
      const [pendingCount, completedWeek, streak, totalXp, nextEvent] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "pending"))),
        db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "completed"), gte(familyTasks.completedAt, new Date(weekStart)))),
        getCurrentStreak(child.id),
        getChildTotalXp(child.id),
        db.select().from(familyCalendarEvents)
          .where(and(eq(familyCalendarEvents.childId, child.id), gte(familyCalendarEvents.startDate, todayStr)))
          .orderBy(asc(familyCalendarEvents.startDate)).limit(1),
      ]);

      return {
        ...child,
        pendingTasks: Number(pendingCount[0]?.count ?? 0),
        completedTasksThisWeek: Number(completedWeek[0]?.count ?? 0),
        streak,
        totalXp,
        level: calculateFamilyXpLevel(totalXp),
        nextDeadline: nextEvent[0] || null,
        streakBadge: FAMILY_STREAK_BADGES.filter((b) => streak >= b.days).pop() || null,
      };
    }));

    // Family totals
    const totalStudyHours = 0; // Would integrate with session tracking
    const totalTasksCompleted = childSummaries.reduce((sum, c) => sum + c.completedTasksThisWeek, 0);
    const totalUpcoming = childSummaries.reduce((sum, c) => sum + c.pendingTasks, 0);

    // Leaderboard by weekly XP (simplified: use completedTasksThisWeek * 10)
    const leaderboard = [...childSummaries]
      .sort((a, b) => b.completedTasksThisWeek - a.completedTasksThisWeek)
      .map((c, i) => ({
        rank: i + 1,
        childName: c.childName,
        avatarEmoji: c.avatarEmoji,
        weeklyXp: c.completedTasksThisWeek * FAMILY_XP.TASK_COMPLETE,
      }));

    res.json({
      children: childSummaries,
      familySummary: { totalStudyHours, totalTasksCompleted, totalUpcoming },
      leaderboard,
      isSummerMode: isSummerMode(),
    });
  } catch (err) { handleError(res, err, "Failed to fetch family dashboard"); }
});

// --- Engagement Score ---
familyAcademicRouter.get("/children/:childId/engagement", async (req, res) => {
  try {
    const scores = await db.select().from(familyEngagementScores)
      .where(and(eq(familyEngagementScores.childId, req.params.childId), eq(familyEngagementScores.parentUserId, getUserId(req))))
      .orderBy(desc(familyEngagementScores.weekStart))
      .limit(12);
    res.json(scores);
  } catch (err) { handleError(res, err, "Failed to fetch engagement scores"); }
});

// --- Weekly Report Generation ---
familyAcademicRouter.post("/weekly-report", async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user.length) return res.status(404).json({ message: "User not found" });

    const children = await db.select().from(familyChildren)
      .where(and(eq(familyChildren.parentUserId, userId), eq(familyChildren.isActive, true)));

    const weekStart = getMonday(new Date());
    const reports = [];

    for (const child of children) {
      const [completed, pending, missed, achievements, streak] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "completed"), gte(familyTasks.completedAt, new Date(weekStart)))),
        db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "pending"))),
        db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks)
          .where(and(eq(familyTasks.childId, child.id), eq(familyTasks.status, "pending"), lte(familyTasks.dueDate, weekStart))),
        db.select().from(familyAchievements)
          .where(and(eq(familyAchievements.childId, child.id), gte(familyAchievements.earnedAt, new Date(weekStart)))),
        getCurrentStreak(child.id),
      ]);

      const reportData = {
        childName: child.childName,
        gradeLevel: child.gradeLevel,
        avatarEmoji: child.avatarEmoji,
        tasksCompleted: Number(completed[0]?.count ?? 0),
        tasksPending: Number(pending[0]?.count ?? 0),
        tasksMissed: Number(missed[0]?.count ?? 0),
        newAchievements: achievements,
        streak,
        weekStart,
      };

      reports.push(reportData);

      // Cache report
      await db.insert(familyWeeklyReports).values({
        childId: child.id,
        parentUserId: userId,
        weekStart,
        reportData: reportData as any,
      });
    }

    // Send email via Resend if configured
    try {
      const { Resend } = await import("resend");
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resend = new Resend(apiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@jiemastery.ai";
        const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;

        const childSections = reports.map((r) => `
          <div style="margin-bottom:24px;padding:16px;background:#f8f9fa;border-radius:8px;">
            <h3>${r.avatarEmoji || "📚"} ${r.childName} (${r.gradeLevel || "Grade N/A"})</h3>
            <p>🔥 Streak: ${r.streak} days</p>
            <p>✅ Tasks completed: ${r.tasksCompleted} | ⏳ Pending: ${r.tasksPending} | ❌ Missed: ${r.tasksMissed}</p>
            ${r.newAchievements.length > 0 ? `<p>🏆 New badges: ${r.newAchievements.map((a) => `${a.achievementEmoji} ${a.achievementName}`).join(", ")}</p>` : ""}
            <a href="${baseUrl}/family/child/${r.childName}" style="color:#6366f1;">Study with JIE →</a>
          </div>
        `).join("");

        await resend.emails.send({
          from: fromEmail,
          to: user[0].email,
          subject: `📊 Weekly Learning Report — ${new Date().toLocaleDateString()}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
              <h1 style="color:#6366f1;">📊 Family Weekly Report</h1>
              <p>Here's how your family did this week:</p>
              ${childSections}
              <hr/>
              <p style="font-size:12px;color:#999;">
                <a href="${baseUrl}/family">View Full Dashboard</a> |
                <a href="${baseUrl}/unsubscribe?email=${encodeURIComponent(user[0].email)}">Unsubscribe</a>
              </p>
            </div>
          `,
        });
      }
    } catch (emailErr) {
      console.warn("[Family Academic] Weekly report email failed (non-blocking):", emailErr);
    }

    res.json({ reports, emailSent: !!process.env.RESEND_API_KEY });
  } catch (err) { handleError(res, err, "Failed to generate weekly report"); }
});

// ============ ADMIN ROUTES ============

export const familyAcademicAdminRouter = Router();

familyAcademicAdminRouter.get("/overview", async (req, res) => {
  try {
    const [totalFamilies, totalChildren, totalTasks, totalEvents] = await Promise.all([
      db.select({ count: sql<number>`COUNT(DISTINCT ${familyChildren.parentUserId})` }).from(familyChildren),
      db.select({ count: sql<number>`COUNT(*)` }).from(familyChildren).where(eq(familyChildren.isActive, true)),
      db.select({ count: sql<number>`COUNT(*)` }).from(familyTasks),
      db.select({ count: sql<number>`COUNT(*)` }).from(familyCalendarEvents),
    ]);

    const completedTasks = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(familyTasks)
      .where(eq(familyTasks.status, "completed"));

    const atRiskChildren = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${familyEngagementScores.childId})` })
      .from(familyEngagementScores)
      .where(or(eq(familyEngagementScores.riskLevel, "at_risk"), eq(familyEngagementScores.riskLevel, "critical")));

    res.json({
      totalFamilies: Number(totalFamilies[0]?.count ?? 0),
      totalChildren: Number(totalChildren[0]?.count ?? 0),
      totalTasks: Number(totalTasks[0]?.count ?? 0),
      completedTasks: Number(completedTasks[0]?.count ?? 0),
      totalEvents: Number(totalEvents[0]?.count ?? 0),
      atRiskChildren: Number(atRiskChildren[0]?.count ?? 0),
    });
  } catch (err) { handleError(res, err, "Admin: Failed to fetch overview"); }
});

familyAcademicAdminRouter.get("/families", async (req, res) => {
  try {
    const families = await db
      .select({
        parentUserId: familyChildren.parentUserId,
        childCount: sql<number>`COUNT(*)`,
        parentEmail: users.email,
        parentName: users.parentName,
      })
      .from(familyChildren)
      .innerJoin(users, eq(familyChildren.parentUserId, users.id))
      .where(eq(familyChildren.isActive, true))
      .groupBy(familyChildren.parentUserId, users.email, users.parentName)
      .orderBy(desc(sql`COUNT(*)`));

    res.json(families);
  } catch (err) { handleError(res, err, "Admin: Failed to fetch families"); }
});

familyAcademicAdminRouter.get("/engagement", async (req, res) => {
  try {
    const scores = await db
      .select({
        childId: familyEngagementScores.childId,
        childName: familyChildren.childName,
        gradeLevel: familyChildren.gradeLevel,
        engagementScore: familyEngagementScores.engagementScore,
        riskLevel: familyEngagementScores.riskLevel,
        trend: familyEngagementScores.trend,
        weekStart: familyEngagementScores.weekStart,
      })
      .from(familyEngagementScores)
      .innerJoin(familyChildren, eq(familyEngagementScores.childId, familyChildren.id))
      .orderBy(desc(familyEngagementScores.weekStart))
      .limit(100);

    res.json(scores);
  } catch (err) { handleError(res, err, "Admin: Failed to fetch engagement data"); }
});

familyAcademicAdminRouter.get("/interventions", async (req, res) => {
  try {
    const atRisk = await db
      .select({
        childId: familyEngagementScores.childId,
        childName: familyChildren.childName,
        parentEmail: users.email,
        engagementScore: familyEngagementScores.engagementScore,
        riskLevel: familyEngagementScores.riskLevel,
        weekStart: familyEngagementScores.weekStart,
      })
      .from(familyEngagementScores)
      .innerJoin(familyChildren, eq(familyEngagementScores.childId, familyChildren.id))
      .innerJoin(users, eq(familyEngagementScores.parentUserId, users.id))
      .where(or(
        eq(familyEngagementScores.riskLevel, "at_risk"),
        eq(familyEngagementScores.riskLevel, "critical"),
        eq(familyEngagementScores.riskLevel, "needs_attention")
      ))
      .orderBy(asc(familyEngagementScores.engagementScore))
      .limit(50);

    res.json(atRisk);
  } catch (err) { handleError(res, err, "Admin: Failed to fetch interventions"); }
});

export default familyAcademicRouter;
