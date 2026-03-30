/**
 * Capital CRM Routes — Funding Pipeline Tracker
 * Admin-only endpoints for managing funding opportunities, contacts, tasks, activities, and documents.
 * Mounted at /api/admin/capital
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { eq, like, or, desc, sql, and, lte, gte } from "drizzle-orm";
import { z } from "zod";
import {
  capitalOpportunities,
  capitalContacts,
  capitalContactOpportunities,
  capitalActivities,
  capitalTasks,
  capitalDocuments,
  insertCapitalOpportunitySchema,
  insertCapitalContactSchema,
  insertCapitalActivitySchema,
  insertCapitalTaskSchema,
  insertCapitalDocumentSchema,
  calculateCapitalWeightedScore,
  calculateCapitalPriorityTier,
  calculateCapitalHealthStatus,
  CAPITAL_STAGES,
  CAPITAL_CLOSED_STAGES,
  type CapitalOpportunity,
  type CapitalTask,
  type CapitalActivity,
} from "@shared/schema";

const router = Router();

// ============ HELPER ============
function qs(req: Request, key: string): string | undefined {
  const val = req.query[key];
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0] as string;
  return undefined;
}

function handleError(res: Response, err: unknown, context = "Operation failed") {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: err.errors });
  }
  console.error(`[Capital CRM] ${context}:`, err);
  return res.status(500).json({ message: context });
}

// ============ OPPORTUNITIES ============

// GET /api/admin/capital/opportunities
router.get("/opportunities", async (req: Request, res: Response) => {
  try {
    const stage = qs(req, "stage");
    const category = qs(req, "category");
    const geography = qs(req, "geography");
    const search = qs(req, "search");
    const priorityTier = qs(req, "priorityTier");
    const healthStatus = qs(req, "healthStatus");
    const capitalType = qs(req, "capitalType");
    const view = qs(req, "view");

    let opps: CapitalOpportunity[];

    if (search) {
      const pattern = `%${search}%`;
      opps = await db
        .select()
        .from(capitalOpportunities)
        .where(
          or(
            like(capitalOpportunities.name, pattern),
            like(capitalOpportunities.fundingSource, pattern),
            like(capitalOpportunities.description, pattern)
          )
        )
        .orderBy(desc(capitalOpportunities.updatedAt));
    } else {
      opps = await db
        .select()
        .from(capitalOpportunities)
        .orderBy(desc(capitalOpportunities.updatedAt));
    }

    if (stage) opps = opps.filter((o) => o.stage === stage);
    if (category) opps = opps.filter((o) => o.fundingCategory === category);
    if (geography) opps = opps.filter((o) => o.geography === geography);
    if (priorityTier) opps = opps.filter((o) => o.priorityTier === priorityTier);
    if (healthStatus) opps = opps.filter((o) => o.healthStatus === healthStatus);
    if (capitalType) opps = opps.filter((o) => o.capitalType === capitalType);

    // Smart views
    if (view) {
      const today = new Date().toISOString().split("T")[0];
      const closedStages = ["Awarded", "Closed Lost", "Deferred"];
      switch (view) {
        case "fast-capital":
          opps = opps.filter((o) => o.eligible30_60 === true && !closedStages.includes(o.stage));
          break;
        case "non-dilutive":
          opps = opps.filter((o) => o.capitalType === "Non-dilutive" && !closedStages.includes(o.stage));
          break;
        case "illinois":
          opps = opps.filter((o) => (o.geography === "Illinois" || o.geography === "Chicago") && !closedStages.includes(o.stage));
          break;
        case "high-probability":
          opps = opps.filter((o) => (o.probabilityScore ?? 0) >= 7 && !closedStages.includes(o.stage));
          break;
        case "needs-followup":
          opps = opps.filter((o) => o.nextFollowUpDate && o.nextFollowUpDate <= today && !closedStages.includes(o.stage));
          break;
        case "submitted":
          opps = opps.filter((o) => o.stage === "Submitted" || o.stage === "Follow-Up Pending");
          break;
        case "warm-intro":
          opps = opps.filter((o) => o.warmIntroAvailable === true && !closedStages.includes(o.stage));
          break;
        case "at-risk":
          opps = opps.filter((o) => o.healthStatus === "At Risk");
          break;
        case "stalled":
          opps = opps.filter((o) => o.healthStatus === "Stalled");
          break;
        case "tier-1":
          opps = opps.filter((o) => o.priorityTier === "Tier 1 Immediate" && !closedStages.includes(o.stage));
          break;
      }
    }

    return res.json(opps);
  } catch (err) {
    return handleError(res, err, "Failed to get opportunities");
  }
});

// GET /api/admin/capital/opportunities/:id
router.get("/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const opp = await db.select().from(capitalOpportunities).where(eq(capitalOpportunities.id, id)).limit(1);
    if (!opp.length) return res.status(404).json({ message: "Opportunity not found" });
    return res.json(opp[0]);
  } catch (err) {
    return handleError(res, err, "Failed to get opportunity");
  }
});

// POST /api/admin/capital/opportunities
router.post("/opportunities", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const body = {
      ...req.body,
      createdAt: req.body.createdAt || now,
      updatedAt: req.body.updatedAt || now,
    };
    const data = insertCapitalOpportunitySchema.parse(body);

    // Calculate scores
    const ws = calculateCapitalWeightedScore(data);
    const tier = calculateCapitalPriorityTier(ws);
    const health = calculateCapitalHealthStatus({
      stage: data.stage || "Identified",
      lastContactDate: data.lastContactDate,
      nextFollowUpDate: data.nextFollowUpDate,
      updatedAt: data.updatedAt || now,
    });

    const result = await db
      .insert(capitalOpportunities)
      .values({
        ...data,
        weightedScore: String(Math.round(ws * 100) / 100),
        priorityTier: tier,
        healthStatus: health,
      })
      .returning();

    return res.status(201).json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to create opportunity");
  }
});

// PATCH /api/admin/capital/opportunities/:id
router.patch("/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await db.select().from(capitalOpportunities).where(eq(capitalOpportunities.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ message: "Opportunity not found" });

    const data = insertCapitalOpportunitySchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) return res.json(existing[0]);

    // Merge with existing to recalculate scores
    const merged = { ...existing[0], ...data };
    const ws = calculateCapitalWeightedScore(merged);
    const tier = calculateCapitalPriorityTier(ws);
    const health = calculateCapitalHealthStatus({
      stage: merged.stage,
      lastContactDate: merged.lastContactDate,
      nextFollowUpDate: merged.nextFollowUpDate,
      updatedAt: merged.updatedAt,
    });

    const result = await db
      .update(capitalOpportunities)
      .set({
        ...data,
        weightedScore: String(Math.round(ws * 100) / 100),
        priorityTier: tier,
        healthStatus: health,
        updatedAt: new Date().toISOString().split("T")[0],
      })
      .where(eq(capitalOpportunities.id, id))
      .returning();

    return res.json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to update opportunity");
  }
});

// DELETE /api/admin/capital/opportunities/:id
router.delete("/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await db.select().from(capitalOpportunities).where(eq(capitalOpportunities.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ message: "Opportunity not found" });

    await db.delete(capitalOpportunities).where(eq(capitalOpportunities.id, id));
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, "Failed to delete opportunity");
  }
});

// ============ CONTACTS ============

// GET /api/admin/capital/contacts
router.get("/contacts", async (req: Request, res: Response) => {
  try {
    const search = qs(req, "search");
    let allContacts;

    if (search) {
      const pattern = `%${search}%`;
      allContacts = await db
        .select()
        .from(capitalContacts)
        .where(
          or(
            like(capitalContacts.name, pattern),
            like(capitalContacts.organization, pattern),
            like(capitalContacts.email, pattern)
          )
        )
        .orderBy(desc(capitalContacts.createdAt));
    } else {
      allContacts = await db
        .select()
        .from(capitalContacts)
        .orderBy(desc(capitalContacts.createdAt));
    }

    return res.json(allContacts);
  } catch (err) {
    return handleError(res, err, "Failed to get contacts");
  }
});

// GET /api/admin/capital/contacts/by-opportunity/:opportunityId
router.get("/contacts/by-opportunity/:opportunityId", async (req: Request, res: Response) => {
  try {
    const opportunityId = req.params.opportunityId;
    // Get linked contact IDs
    const links = await db
      .select()
      .from(capitalContactOpportunities)
      .where(eq(capitalContactOpportunities.opportunityId, opportunityId));

    if (!links.length) return res.json([]);

    const contactIds = links.map((l) => l.contactId);
    const contacts = await db
      .select()
      .from(capitalContacts)
      .where(or(...contactIds.map((cid) => eq(capitalContacts.id, cid))));

    return res.json(contacts);
  } catch (err) {
    return handleError(res, err, "Failed to get contacts by opportunity");
  }
});

// GET /api/admin/capital/contacts/:id
router.get("/contacts/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const contact = await db.select().from(capitalContacts).where(eq(capitalContacts.id, id)).limit(1);
    if (!contact.length) return res.status(404).json({ message: "Contact not found" });
    return res.json(contact[0]);
  } catch (err) {
    return handleError(res, err, "Failed to get contact");
  }
});

// POST /api/admin/capital/contacts
router.post("/contacts", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const body = { ...req.body, createdAt: req.body.createdAt || now };
    const data = insertCapitalContactSchema.parse(body);
    const result = await db.insert(capitalContacts).values(data).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to create contact");
  }
});

// PATCH /api/admin/capital/contacts/:id
router.patch("/contacts/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = insertCapitalContactSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      const existing = await db.select().from(capitalContacts).where(eq(capitalContacts.id, id)).limit(1);
      return res.json(existing[0]);
    }
    const result = await db.update(capitalContacts).set(data).where(eq(capitalContacts.id, id)).returning();
    if (!result.length) return res.status(404).json({ message: "Contact not found" });
    return res.json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to update contact");
  }
});

// DELETE /api/admin/capital/contacts/:id
router.delete("/contacts/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await db.delete(capitalContacts).where(eq(capitalContacts.id, id));
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, "Failed to delete contact");
  }
});

// POST /api/admin/capital/contacts/:contactId/link/:opportunityId
router.post("/contacts/:contactId/link/:opportunityId", async (req: Request, res: Response) => {
  try {
    const { contactId, opportunityId } = req.params;
    await db.insert(capitalContactOpportunities).values({ contactId, opportunityId });
    return res.status(201).json({ message: "Linked" });
  } catch (err) {
    return handleError(res, err, "Failed to link contact to opportunity");
  }
});

// DELETE /api/admin/capital/contacts/:contactId/unlink/:opportunityId
router.delete("/contacts/:contactId/unlink/:opportunityId", async (req: Request, res: Response) => {
  try {
    const { contactId, opportunityId } = req.params;
    await db
      .delete(capitalContactOpportunities)
      .where(
        and(
          eq(capitalContactOpportunities.contactId, contactId),
          eq(capitalContactOpportunities.opportunityId, opportunityId)
        )
      );
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, "Failed to unlink contact from opportunity");
  }
});

// ============ ACTIVITIES ============

// GET /api/admin/capital/activities
router.get("/activities", async (req: Request, res: Response) => {
  try {
    const opportunityId = qs(req, "opportunityId");
    const contactId = qs(req, "contactId");
    const limitStr = qs(req, "limit");

    if (opportunityId) {
      const acts = await db
        .select()
        .from(capitalActivities)
        .where(eq(capitalActivities.opportunityId, opportunityId))
        .orderBy(desc(capitalActivities.createdAt));
      return res.json(acts);
    }

    if (contactId) {
      const acts = await db
        .select()
        .from(capitalActivities)
        .where(eq(capitalActivities.contactId, contactId))
        .orderBy(desc(capitalActivities.createdAt));
      return res.json(acts);
    }

    const lim = limitStr ? parseInt(limitStr, 10) : 50;
    const acts = await db
      .select()
      .from(capitalActivities)
      .orderBy(desc(capitalActivities.createdAt))
      .limit(lim);
    return res.json(acts);
  } catch (err) {
    return handleError(res, err, "Failed to get activities");
  }
});

// POST /api/admin/capital/activities
router.post("/activities", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const body = { ...req.body, createdAt: req.body.createdAt || now };
    const data = insertCapitalActivitySchema.parse(body);
    const result = await db.insert(capitalActivities).values(data).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to create activity");
  }
});

// ============ TASKS ============

// GET /api/admin/capital/tasks
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const status = qs(req, "status");
    const opportunityId = qs(req, "opportunityId");
    const view = qs(req, "view");
    const today = new Date().toISOString().split("T")[0];

    if (view === "overdue") {
      const tasks = await db
        .select()
        .from(capitalTasks)
        .where(and(lte(capitalTasks.dueDate, today), sql`${capitalTasks.status} != 'Completed'`));
      return res.json(tasks);
    }

    if (view === "today") {
      const tasks = await db
        .select()
        .from(capitalTasks)
        .where(and(eq(capitalTasks.dueDate, today), sql`${capitalTasks.status} != 'Completed'`));
      return res.json(tasks);
    }

    if (view === "thisWeek") {
      const d7 = new Date();
      d7.setDate(d7.getDate() + 7);
      const d7s = d7.toISOString().split("T")[0];
      const tasks = await db
        .select()
        .from(capitalTasks)
        .where(
          and(
            gte(capitalTasks.dueDate, today),
            lte(capitalTasks.dueDate, d7s),
            sql`${capitalTasks.status} != 'Completed'`
          )
        );
      return res.json(tasks);
    }

    let query = db.select().from(capitalTasks);

    if (opportunityId) {
      const tasks = await db
        .select()
        .from(capitalTasks)
        .where(eq(capitalTasks.opportunityId, opportunityId))
        .orderBy(desc(capitalTasks.createdAt));
      const filtered = status ? tasks.filter((t) => t.status === status) : tasks;
      return res.json(filtered);
    }

    const tasks = await db.select().from(capitalTasks).orderBy(desc(capitalTasks.createdAt));
    const filtered = status ? tasks.filter((t) => t.status === status) : tasks;
    return res.json(filtered);
  } catch (err) {
    return handleError(res, err, "Failed to get tasks");
  }
});

// GET /api/admin/capital/tasks/:id
router.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const task = await db.select().from(capitalTasks).where(eq(capitalTasks.id, id)).limit(1);
    if (!task.length) return res.status(404).json({ message: "Task not found" });
    return res.json(task[0]);
  } catch (err) {
    return handleError(res, err, "Failed to get task");
  }
});

// POST /api/admin/capital/tasks
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const body = { ...req.body, createdAt: req.body.createdAt || now };
    const data = insertCapitalTaskSchema.parse(body);
    const result = await db.insert(capitalTasks).values(data).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to create task");
  }
});

// PATCH /api/admin/capital/tasks/:id
router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = insertCapitalTaskSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      const existing = await db.select().from(capitalTasks).where(eq(capitalTasks.id, id)).limit(1);
      return res.json(existing[0]);
    }
    const result = await db.update(capitalTasks).set(data).where(eq(capitalTasks.id, id)).returning();
    if (!result.length) return res.status(404).json({ message: "Task not found" });
    return res.json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to update task");
  }
});

// DELETE /api/admin/capital/tasks/:id
router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await db.delete(capitalTasks).where(eq(capitalTasks.id, id));
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, "Failed to delete task");
  }
});

// ============ DOCUMENTS ============

// GET /api/admin/capital/documents
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const opportunityId = qs(req, "opportunityId");

    if (opportunityId) {
      const docs = await db
        .select()
        .from(capitalDocuments)
        .where(eq(capitalDocuments.opportunityId, opportunityId))
        .orderBy(desc(capitalDocuments.createdAt));
      return res.json(docs);
    }

    const docs = await db.select().from(capitalDocuments).orderBy(desc(capitalDocuments.createdAt));
    return res.json(docs);
  } catch (err) {
    return handleError(res, err, "Failed to get documents");
  }
});

// POST /api/admin/capital/documents
router.post("/documents", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const body = { ...req.body, createdAt: req.body.createdAt || now };
    const data = insertCapitalDocumentSchema.parse(body);
    const result = await db.insert(capitalDocuments).values(data).returning();
    return res.status(201).json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to create document");
  }
});

// PATCH /api/admin/capital/documents/:id
router.patch("/documents/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = insertCapitalDocumentSchema.partial().parse(req.body);
    const result = await db.update(capitalDocuments).set(data).where(eq(capitalDocuments.id, id)).returning();
    if (!result.length) return res.status(404).json({ message: "Document not found" });
    return res.json(result[0]);
  } catch (err) {
    return handleError(res, err, "Failed to update document");
  }
});

// DELETE /api/admin/capital/documents/:id
router.delete("/documents/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await db.delete(capitalDocuments).where(eq(capitalDocuments.id, id));
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, "Failed to delete document");
  }
});

// ============ DASHBOARD ============

// GET /api/admin/capital/dashboard
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const allOpps = await db.select().from(capitalOpportunities).orderBy(desc(capitalOpportunities.updatedAt));
    const closedStages = ["Awarded", "Closed Lost", "Deferred"];
    const active = allOpps.filter((o) => !closedStages.includes(o.stage));
    const today = new Date().toISOString().split("T")[0];

    // Stage counts
    const byStage: Record<string, number> = {};
    for (const o of allOpps) {
      byStage[o.stage] = (byStage[o.stage] || 0) + 1;
    }

    // Category counts
    const byCategory: Record<string, number> = {};
    for (const o of active) {
      byCategory[o.fundingCategory] = (byCategory[o.fundingCategory] || 0) + 1;
    }

    // Pipeline values
    const totalPipelineValue = active.reduce((s, o) => s + Number(o.expectedAmount || 0), 0);
    const weightedPipeline = active.reduce(
      (s, o) => s + Number(o.expectedAmount || 0) * ((o.probabilityToClose || 0) / 100),
      0
    );

    // 30-60 day capital
    const expected30_60Capital = active
      .filter((o) => o.eligible30_60 === true)
      .reduce((s, o) => s + Number(o.expectedAmount || 0) * ((o.probabilityToClose || 0) / 100), 0);

    // Counts
    const tier1Count = active.filter((o) => o.priorityTier === "Tier 1 Immediate").length;
    const nonDilutiveActive = active.filter((o) => o.capitalType === "Non-dilutive");
    const nonDilutiveCount = nonDilutiveActive.length;
    const nonDilutivePipeline = nonDilutiveActive.reduce((s, o) => s + Number(o.expectedAmount || 0), 0);
    const atRiskCount = active.filter((o) => o.healthStatus === "At Risk").length;
    const stalledCount = active.filter((o) => o.healthStatus === "Stalled").length;

    // Overdue follow-ups
    const overdueFollowUps = active.filter((o) => o.nextFollowUpDate && o.nextFollowUpDate < today);

    // Overdue tasks
    const allTasks = await db.select().from(capitalTasks);
    const overdueTasks = allTasks.filter(
      (t) => t.dueDate && t.dueDate < today && t.status !== "Completed"
    );

    // Deadlines
    const d7 = new Date(); d7.setDate(d7.getDate() + 7);
    const d14 = new Date(); d14.setDate(d14.getDate() + 14);
    const d30 = new Date(); d30.setDate(d30.getDate() + 30);
    const d7s = d7.toISOString().split("T")[0];
    const d14s = d14.toISOString().split("T")[0];
    const d30s = d30.toISOString().split("T")[0];

    const deadlines7 = active.filter((o) => o.deadlineDate && o.deadlineDate >= today && o.deadlineDate <= d7s).length;
    const deadlines14 = active.filter((o) => o.deadlineDate && o.deadlineDate >= today && o.deadlineDate <= d14s).length;
    const deadlines30 = active.filter((o) => o.deadlineDate && o.deadlineDate >= today && o.deadlineDate <= d30s).length;

    const upcomingDeadlines = active
      .filter((o) => o.deadlineDate && o.deadlineDate >= today && o.deadlineDate <= d30s)
      .sort((a, b) => (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? ""));

    // Recent activities
    const recentActivities = await db
      .select()
      .from(capitalActivities)
      .orderBy(desc(capitalActivities.createdAt))
      .limit(15);

    // Top opportunities
    const topOpportunities = [...active]
      .sort((a, b) => Number(b.weightedScore ?? 0) - Number(a.weightedScore ?? 0))
      .slice(0, 10);

    // Pipeline by stage
    const stageNames = [...new Set(allOpps.map((o) => o.stage))];
    const pipelineByStage = stageNames.map((stage) => {
      const stageOpps = allOpps.filter((o) => o.stage === stage);
      return {
        stage,
        count: stageOpps.length,
        value: stageOpps.reduce((s, o) => s + Number(o.expectedAmount || 0), 0),
      };
    });

    // Pipeline by category
    const catNames = [...new Set(allOpps.map((o) => o.fundingCategory))];
    const pipelineByCategory = catNames
      .map((category) => {
        const catOpps = active.filter((o) => o.fundingCategory === category);
        return {
          category,
          count: catOpps.length,
          value: catOpps.reduce((s, o) => s + Number(o.expectedAmount || 0), 0),
          weightedValue: catOpps.reduce(
            (s, o) => s + Number(o.expectedAmount || 0) * ((o.probabilityToClose || 0) / 100),
            0
          ),
        };
      })
      .filter((c) => c.count > 0);

    return res.json({
      totalOpportunities: allOpps.length,
      activeOpportunities: active.length,
      byStage,
      byCategory,
      totalPipelineValue,
      weightedPipeline,
      expected30_60Capital,
      tier1Count,
      nonDilutiveCount,
      nonDilutivePipeline,
      atRiskCount,
      stalledCount,
      overdueFollowUpsCount: overdueFollowUps.length,
      overdueTasksCount: overdueTasks.length,
      deadlines7,
      deadlines14,
      deadlines30,
      upcomingDeadlines,
      recentActivities,
      topOpportunities,
      pipelineByStage,
      pipelineByCategory,
    });
  } catch (err) {
    return handleError(res, err, "Failed to get dashboard stats");
  }
});

// ============ TODAY / COMMAND CENTER ============

// GET /api/admin/capital/today
router.get("/today", async (req: Request, res: Response) => {
  try {
    const allOpps = await db.select().from(capitalOpportunities);
    const allTasks = await db.select().from(capitalTasks);
    const today = new Date().toISOString().split("T")[0];
    const closedStages = ["Awarded", "Closed Lost", "Deferred"];
    const active = allOpps.filter((o) => !closedStages.includes(o.stage));

    // Tasks
    const tasksDueToday = allTasks.filter((t) => t.dueDate === today && t.status !== "Completed");
    const overdueTasks = allTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "Completed");

    // Follow-ups due
    const followUpsDue = active
      .filter((o) => o.nextFollowUpDate && o.nextFollowUpDate <= today)
      .sort((a, b) => (a.nextFollowUpDate ?? "").localeCompare(b.nextFollowUpDate ?? ""));

    // Deadlines within 7 days
    const d7 = new Date();
    d7.setDate(d7.getDate() + 7);
    const d7s = d7.toISOString().split("T")[0];
    const deadlinesWithin7 = active
      .filter((o) => o.deadlineDate && o.deadlineDate >= today && o.deadlineDate <= d7s)
      .sort((a, b) => (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? ""));

    // Top scoring
    const topScoringOpps = [...active]
      .sort((a, b) => Number(b.weightedScore ?? 0) - Number(a.weightedScore ?? 0))
      .slice(0, 5);

    // Health
    const atRiskOpps = active.filter((o) => o.healthStatus === "At Risk");
    const stalledOpps = active.filter((o) => o.healthStatus === "Stalled");

    // Recently updated
    const d7ago = new Date();
    d7ago.setDate(d7ago.getDate() - 7);
    const d7agoStr = d7ago.toISOString().split("T")[0];
    const recentlyUpdated = active
      .filter((o) => o.updatedAt >= d7agoStr)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);

    // Fast capital
    const fastCapitalOpps = active
      .filter((o) => o.eligible30_60 === true)
      .sort((a, b) => Number(b.weightedScore ?? 0) - Number(a.weightedScore ?? 0));

    // Founder actions
    const founderActions: Array<{
      type: string;
      urgency: "critical" | "high" | "medium";
      title: string;
      description: string;
      opportunityId?: string;
      opportunityName?: string;
      taskId?: string;
    }> = [];

    for (const task of overdueTasks.slice(0, 5)) {
      founderActions.push({
        type: "overdue_task",
        urgency: "critical",
        title: `Overdue: ${task.title}`,
        description: `Due ${task.dueDate}`,
        opportunityId: task.opportunityId ?? undefined,
        taskId: task.id,
      });
    }

    for (const opp of deadlinesWithin7) {
      founderActions.push({
        type: "deadline_approaching",
        urgency: "critical",
        title: `Deadline: ${opp.name}`,
        description: `Due ${opp.deadlineDate}`,
        opportunityId: opp.id,
        opportunityName: opp.name,
      });
    }

    const tier1NoAction = active.filter(
      (o) => o.priorityTier === "Tier 1 Immediate" && !o.nextAction
    );
    for (const opp of tier1NoAction.slice(0, 3)) {
      const oppTasks = allTasks.filter((t) => t.opportunityId === opp.id && t.status !== "Completed");
      if (oppTasks.length === 0) {
        founderActions.push({
          type: "no_next_action",
          urgency: "high",
          title: `No next action: ${opp.name}`,
          description: `Tier 1 opportunity without a next step`,
          opportunityId: opp.id,
          opportunityName: opp.name,
        });
      }
    }

    for (const opp of [...atRiskOpps, ...stalledOpps].slice(0, 4)) {
      founderActions.push({
        type: "health_warning",
        urgency: opp.healthStatus === "Stalled" ? "critical" : "high",
        title: `${opp.healthStatus}: ${opp.name}`,
        description: `Needs attention — ${opp.healthStatus === "Stalled" ? "no activity in 14+ days" : "at risk of stalling"}`,
        opportunityId: opp.id,
        opportunityName: opp.name,
      });
    }

    const submittedNoFollowUp = active.filter(
      (o) => (o.stage === "Submitted" || o.stage === "Follow-Up Pending") && !o.nextFollowUpDate
    );
    for (const opp of submittedNoFollowUp.slice(0, 3)) {
      founderActions.push({
        type: "submitted_no_followup",
        urgency: "medium",
        title: `Needs follow-up: ${opp.name}`,
        description: `Submitted but no follow-up date scheduled`,
        opportunityId: opp.id,
        opportunityName: opp.name,
      });
    }

    // Alerts
    const alerts: Array<{
      type: string;
      severity: "critical" | "warning" | "info";
      title: string;
      description: string;
      opportunityId?: string;
      opportunityName?: string;
    }> = [];

    const overdueFollowUps = active.filter((o) => o.nextFollowUpDate && o.nextFollowUpDate < today);
    if (overdueFollowUps.length > 0) {
      alerts.push({
        type: "overdue_followup",
        severity: "warning",
        title: `${overdueFollowUps.length} overdue follow-up${overdueFollowUps.length > 1 ? "s" : ""}`,
        description: overdueFollowUps.map((o) => o.name).slice(0, 3).join(", "),
      });
    }

    if (stalledOpps.length > 0) {
      alerts.push({
        type: "stale_opportunity",
        severity: "warning",
        title: `${stalledOpps.length} stalled opportunit${stalledOpps.length > 1 ? "ies" : "y"}`,
        description: stalledOpps.map((o) => o.name).slice(0, 3).join(", "),
      });
    }

    if (tier1NoAction.length > 0) {
      alerts.push({
        type: "no_next_task_tier1",
        severity: "warning",
        title: `${tier1NoAction.length} Tier 1 opportunit${tier1NoAction.length > 1 ? "ies" : "y"} without next action`,
        description: tier1NoAction.map((o) => o.name).slice(0, 3).join(", "),
      });
    }

    if (submittedNoFollowUp.length > 0) {
      alerts.push({
        type: "submitted_no_followup",
        severity: "info",
        title: `${submittedNoFollowUp.length} submitted application${submittedNoFollowUp.length > 1 ? "s" : ""} without follow-up`,
        description: submittedNoFollowUp.map((o) => o.name).slice(0, 3).join(", "),
      });
    }

    return res.json({
      tasksDueToday,
      overdueTasks,
      followUpsDue,
      deadlinesWithin7,
      topScoringOpps,
      atRiskOpps,
      stalledOpps,
      recentlyUpdated,
      fastCapitalOpps,
      founderActions,
      alerts,
    });
  } catch (err) {
    return handleError(res, err, "Failed to get today stats");
  }
});

// ============ HEALTH REFRESH ============

// POST /api/admin/capital/refresh-health
router.post("/refresh-health", async (req: Request, res: Response) => {
  try {
    const allOpps = await db.select().from(capitalOpportunities);
    let updated = 0;

    for (const opp of allOpps) {
      const newHealth = calculateCapitalHealthStatus({
        stage: opp.stage,
        lastContactDate: opp.lastContactDate,
        nextFollowUpDate: opp.nextFollowUpDate,
        updatedAt: opp.updatedAt,
      });

      if (newHealth !== opp.healthStatus) {
        await db
          .update(capitalOpportunities)
          .set({ healthStatus: newHealth })
          .where(eq(capitalOpportunities.id, opp.id));
        updated++;
      }
    }

    return res.json({ message: `Refreshed health statuses. Updated ${updated} opportunities.` });
  } catch (err) {
    return handleError(res, err, "Failed to refresh health statuses");
  }
});

export default router;
