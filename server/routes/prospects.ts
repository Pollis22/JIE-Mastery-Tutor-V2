/**
 * Sales / Prospects CRM Routes — Customer & Institutional Pipeline
 * Admin-only endpoints for managing sales prospects, contacts, tasks, activities, and documents.
 * Mounted at /api/admin/prospects
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { eq, desc, asc, sql } from "drizzle-orm";
import {
  salesProspects,
  salesContacts,
  salesActivities,
  salesTasks,
  salesDocuments,
  insertSalesProspectSchema,
  insertSalesContactSchema,
  insertSalesActivitySchema,
  insertSalesTaskSchema,
  insertSalesDocumentSchema,
  calculateSalesWeightedScore,
  calculateSalesPriorityTier,
  calculateSalesHealthStatus,
  SALES_STAGES,
  SALES_CLOSED_STAGES,
  type SalesProspect,
} from "@shared/schema";

const router = Router();

// ==================== DASHBOARD ====================
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const allProspects = await db.select().from(salesProspects).orderBy(desc(salesProspects.createdAt));
    const allTasks = await db.select().from(salesTasks);
    const allActivities = await db.select().from(salesActivities).orderBy(desc(salesActivities.createdAt)).limit(20);

    const now = new Date(); now.setHours(0, 0, 0, 0);
    const today = now.toISOString().split("T")[0];
    const day7 = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const day30 = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];

    const active = allProspects.filter(p => !SALES_CLOSED_STAGES.includes(p.stage as any));
    const closedWon = allProspects.filter(p => p.stage === "Closed Won");
    const closedLost = allProspects.filter(p => p.stage === "Closed Lost");

    const byStage: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalPipelineValue = 0, weightedPipeline = 0;

    for (const p of active) {
      byStage[p.stage] = (byStage[p.stage] || 0) + 1;
      byType[p.institutionType] = (byType[p.institutionType] || 0) + 1;
      totalPipelineValue += parseFloat(p.dealSize || "0");
      weightedPipeline += parseFloat(p.weightedValue || "0");
    }

    const closedWonValue = closedWon.reduce((s, p) => s + parseFloat(p.dealSize || "0"), 0);
    const stalledCount = active.filter(p => calculateSalesHealthStatus(p) === "Stalled").length;
    const atRiskCount = active.filter(p => calculateSalesHealthStatus(p) === "At Risk").length;
    const pendingTasks = allTasks.filter(t => t.status !== "Completed");
    const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < today);
    const todayTasks = pendingTasks.filter(t => t.dueDate === today);
    const tier1Count = active.filter(p => p.priorityTier === "Tier 1").length;
    const activePilots = active.filter(p => p.stage === "Pilot Active" || p.stage === "Pilot Review");
    const closeDeadlines7 = active.filter(p => p.closeDate && p.closeDate >= today && p.closeDate <= day7).length;
    const closeDeadlines30 = active.filter(p => p.closeDate && p.closeDate >= today && p.closeDate <= day30).length;

    const byForecast: Record<string, { count: number; value: number }> = {};
    for (const p of active) {
      const cat = p.forecastCategory || "Pipeline";
      if (!byForecast[cat]) byForecast[cat] = { count: 0, value: 0 };
      byForecast[cat].count++;
      byForecast[cat].value += parseFloat(p.dealSize || "0");
    }

    res.json({
      totalProspects: allProspects.length, activeProspects: active.length,
      byStage, byType, byForecast,
      totalPipelineValue, weightedPipeline,
      closedWonCount: closedWon.length, closedWonValue, closedLostCount: closedLost.length,
      winRate: closedWon.length + closedLost.length > 0 ? Math.round((closedWon.length / (closedWon.length + closedLost.length)) * 100) : 0,
      tier1Count, stalledCount, atRiskCount,
      overdueTasksCount: overdueTasks.length, todayTasksCount: todayTasks.length,
      closeDeadlines7, closeDeadlines30, activePilotsCount: activePilots.length,
      recentActivities: allActivities.slice(0, 10),
      upcomingCloseDeals: active.filter(p => p.closeDate && p.closeDate >= today && p.closeDate <= day30).sort((a, b) => (a.closeDate || "").localeCompare(b.closeDate || "")).slice(0, 10),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== TODAY ====================
router.get("/today", async (_req: Request, res: Response) => {
  try {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const today = now.toISOString().split("T")[0];
    const allProspects = await db.select().from(salesProspects);
    const active = allProspects.filter(p => !SALES_CLOSED_STAGES.includes(p.stage as any));
    const allTasks = await db.select().from(salesTasks);
    const pendingTasks = allTasks.filter(t => t.status !== "Completed");
    const recentActivities = await db.select().from(salesActivities).orderBy(desc(salesActivities.createdAt)).limit(8);

    res.json({
      todayTasks: pendingTasks.filter(t => t.dueDate === today),
      overdueTasks: pendingTasks.filter(t => t.dueDate && t.dueDate < today),
      overdueFollowUps: active.filter(p => p.nextFollowUpDate && p.nextFollowUpDate < today).slice(0, 10),
      stalledProspects: active.filter(p => calculateSalesHealthStatus(p) === "Stalled").slice(0, 10),
      tier1Prospects: active.filter(p => p.priorityTier === "Tier 1").slice(0, 10),
      proposalsPending: active.filter(p => p.stage === "Proposal Sent").slice(0, 10),
      pilotActive: active.filter(p => p.stage === "Pilot Active" || p.stage === "Pilot Review").slice(0, 10),
      recentActivities,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== PROSPECTS CRUD ====================
router.get("/prospects", async (req: Request, res: Response) => {
  try {
    let results = await db.select().from(salesProspects).orderBy(desc(salesProspects.updatedAt));
    const { search, stage, type, health } = req.query;
    if (search) { const s = (search as string).toLowerCase(); results = results.filter(p => p.institutionName.toLowerCase().includes(s) || (p.city || "").toLowerCase().includes(s) || (p.state || "").toLowerCase().includes(s)); }
    if (stage) results = results.filter(p => p.stage === stage);
    if (type) results = results.filter(p => p.institutionType === type);
    if (health) results = results.filter(p => p.healthStatus === health);
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/prospects/:id", async (req: Request, res: Response) => {
  try {
    const [prospect] = await db.select().from(salesProspects).where(eq(salesProspects.id, req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect not found" });
    const contacts = await db.select().from(salesContacts).where(eq(salesContacts.prospectId, req.params.id));
    const activities = await db.select().from(salesActivities).where(eq(salesActivities.prospectId, req.params.id)).orderBy(desc(salesActivities.createdAt));
    const tasks = await db.select().from(salesTasks).where(eq(salesTasks.prospectId, req.params.id)).orderBy(desc(salesTasks.createdAt));
    const documents = await db.select().from(salesDocuments).where(eq(salesDocuments.prospectId, req.params.id)).orderBy(desc(salesDocuments.createdAt));
    res.json({ prospect, contacts, activities, tasks, documents });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/prospects", async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ws = calculateSalesWeightedScore(data);
    data.weightedScore = ws.toFixed(2);
    data.priorityTier = calculateSalesPriorityTier(ws);
    data.healthStatus = calculateSalesHealthStatus({ ...data, stage: data.stage || "Identified" });
    data.weightedValue = ((parseFloat(data.dealSize || "0") * (data.probability || 0)) / 100).toFixed(2);
    const parsed = insertSalesProspectSchema.parse(data);
    const [result] = await db.insert(salesProspects).values(parsed).returning();
    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/prospects/:id", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body, updatedAt: new Date().toISOString() };
    const [existing] = await db.select().from(salesProspects).where(eq(salesProspects.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Prospect not found" });
    const merged = { ...existing, ...data };
    if (data.urgencyScore || data.engagementScore || data.fitScore || data.budgetScore || data.authorityScore) {
      const ws = calculateSalesWeightedScore(merged);
      data.weightedScore = ws.toFixed(2);
      data.priorityTier = calculateSalesPriorityTier(ws);
    }
    if (data.dealSize !== undefined || data.probability !== undefined) {
      data.weightedValue = ((parseFloat(data.dealSize ?? existing.dealSize ?? "0") * (data.probability ?? existing.probability ?? 0)) / 100).toFixed(2);
    }
    if (data.stage || data.lastActivityDate || data.nextFollowUpDate) {
      data.healthStatus = calculateSalesHealthStatus(merged);
    }
    const [result] = await db.update(salesProspects).set(data).where(eq(salesProspects.id, req.params.id)).returning();
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/prospects/:id", async (req: Request, res: Response) => {
  try { await db.delete(salesProspects).where(eq(salesProspects.id, req.params.id)); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== CONTACTS CRUD ====================
router.get("/contacts", async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.query;
    const results = prospectId
      ? await db.select().from(salesContacts).where(eq(salesContacts.prospectId, prospectId as string))
      : await db.select().from(salesContacts).orderBy(desc(salesContacts.createdAt));
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/contacts", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body, createdAt: new Date().toISOString() };
    const parsed = insertSalesContactSchema.parse(data);
    const [result] = await db.insert(salesContacts).values(parsed).returning();
    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/contacts/:id", async (req: Request, res: Response) => {
  try {
    const [result] = await db.update(salesContacts).set(req.body).where(eq(salesContacts.id, req.params.id)).returning();
    if (!result) return res.status(404).json({ error: "Contact not found" });
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/contacts/:id", async (req: Request, res: Response) => {
  try { await db.delete(salesContacts).where(eq(salesContacts.id, req.params.id)); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== ACTIVITIES CRUD ====================
router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { prospectId, limit } = req.query;
    const results = prospectId
      ? await db.select().from(salesActivities).where(eq(salesActivities.prospectId, prospectId as string)).orderBy(desc(salesActivities.createdAt))
      : await db.select().from(salesActivities).orderBy(desc(salesActivities.createdAt)).limit(parseInt(limit as string) || 100);
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/activities", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body, createdAt: new Date().toISOString() };
    const parsed = insertSalesActivitySchema.parse(data);
    const [result] = await db.insert(salesActivities).values(parsed).returning();
    if (data.prospectId) {
      await db.update(salesProspects).set({ lastActivityDate: data.createdAt.split("T")[0], updatedAt: data.createdAt }).where(eq(salesProspects.id, data.prospectId));
    }
    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ==================== TASKS CRUD ====================
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    let results = await db.select().from(salesTasks).orderBy(asc(salesTasks.dueDate));
    const { prospectId, status } = req.query;
    if (prospectId) results = results.filter(t => t.prospectId === prospectId);
    if (status) results = results.filter(t => t.status === status);
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body, createdAt: new Date().toISOString() };
    const parsed = insertSalesTaskSchema.parse(data);
    const [result] = await db.insert(salesTasks).values(parsed).returning();
    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body };
    if (data.status === "Completed" && !data.completedDate) data.completedDate = new Date().toISOString().split("T")[0];
    const [result] = await db.update(salesTasks).set(data).where(eq(salesTasks.id, req.params.id)).returning();
    if (!result) return res.status(404).json({ error: "Task not found" });
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try { await db.delete(salesTasks).where(eq(salesTasks.id, req.params.id)); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== DOCUMENTS CRUD ====================
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.query;
    const results = prospectId
      ? await db.select().from(salesDocuments).where(eq(salesDocuments.prospectId, prospectId as string)).orderBy(desc(salesDocuments.createdAt))
      : await db.select().from(salesDocuments).orderBy(desc(salesDocuments.createdAt));
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/documents", async (req: Request, res: Response) => {
  try {
    const data = { ...req.body, createdAt: new Date().toISOString() };
    const parsed = insertSalesDocumentSchema.parse(data);
    const [result] = await db.insert(salesDocuments).values(parsed).returning();
    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ==================== PIPELINE VIEW ====================
router.get("/pipeline", async (_req: Request, res: Response) => {
  try {
    const allProspects = await db.select().from(salesProspects).orderBy(desc(salesProspects.updatedAt));
    const pipeline: Record<string, SalesProspect[]> = {};
    for (const stage of SALES_STAGES) pipeline[stage] = [];
    for (const p of allProspects) { if (pipeline[p.stage]) pipeline[p.stage].push(p); }
    res.json(pipeline);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== BULK RECALCULATE ====================
router.post("/recalculate", async (_req: Request, res: Response) => {
  try {
    const allProspects = await db.select().from(salesProspects);
    let updated = 0;
    for (const p of allProspects) {
      const ws = calculateSalesWeightedScore(p);
      const wv = ((parseFloat(p.dealSize || "0") * (p.probability || 0)) / 100).toFixed(2);
      await db.update(salesProspects).set({
        weightedScore: ws.toFixed(2), priorityTier: calculateSalesPriorityTier(ws),
        healthStatus: calculateSalesHealthStatus(p), weightedValue: wv, updatedAt: new Date().toISOString(),
      }).where(eq(salesProspects.id, p.id));
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== SEED DATA ====================
router.post("/seed", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select().from(salesProspects).limit(1);
    if (existing.length > 0) return res.json({ message: "Seed data already exists", count: 0 });

    const now = new Date().toISOString();
    const seeds: any[] = [];

    function addProspect(name: string, type: string, sector: string, sub: string, city: string, state: string, stage: string, students: number | null, staff: number | null, schools: number | null, deal: number, source: string) {
      const prob = getStageProbability(stage);
      const ws = 5.0;
      seeds.push({
        institutionName: name, institutionType: type, sector, subsector: sub,
        city, state, region: getRegion(state), country: "USA",
        estimatedStudents: students, estimatedStaff: staff, numberOfSchools: schools,
        stage, dealSize: deal.toString(), probability: prob,
        weightedValue: ((deal * prob) / 100).toFixed(2),
        forecastCategory: getForecastCategory(stage), source,
        priorityTier: deal > 500000 ? "Tier 1" : deal > 100000 ? "Tier 2" : "Tier 3",
        weightedScore: ws.toFixed(2), healthStatus: "Healthy",
        createdAt: now, updatedAt: now,
      });
    }

    // K-12 Districts (12)
    addProspect("Chicago Public Schools", "K-12 District", "Education", "K-12", "Chicago", "IL", "Researching", 330000, null, 634, 2640000, "Existing List");
    addProspect("Houston ISD", "K-12 District", "Education", "K-12", "Houston", "TX", "Identified", 194000, null, 280, 1552000, "Existing List");
    addProspect("Clark County School District", "K-12 District", "Education", "K-12", "Las Vegas", "NV", "Outreach Sent", 305000, null, 357, 2440000, "Existing List");
    addProspect("Miami-Dade County Schools", "K-12 District", "Education", "K-12", "Miami", "FL", "Discovery", 350000, null, 500, 2800000, "Existing List");
    addProspect("Denver Public Schools", "K-12 District", "Education", "K-12", "Denver", "CO", "Intro Scheduled", 92000, null, 207, 736000, "Referral");
    addProspect("Austin ISD", "K-12 District", "Education", "K-12", "Austin", "TX", "Qualified", 75000, null, 130, 600000, "Conference");
    addProspect("San Francisco USD", "K-12 District", "Education", "K-12", "San Francisco", "CA", "Demo Scheduled", 52000, null, 115, 416000, "Inbound Website");
    addProspect("Boston Public Schools", "K-12 District", "Education", "K-12", "Boston", "MA", "Identified", 49000, null, 125, 392000, "Existing List");
    addProspect("Minneapolis Public Schools", "K-12 District", "Education", "K-12", "Minneapolis", "MN", "Outreach Sent", 29000, null, 70, 232000, "Cold Outreach");
    addProspect("Portland Public Schools", "K-12 District", "Education", "K-12", "Portland", "OR", "Identified", 47000, null, 81, 376000, "Existing List");
    addProspect("Mesa Public Schools", "K-12 District", "Education", "K-12", "Mesa", "AZ", "Researching", 60000, null, 83, 480000, "Existing List");
    addProspect("Fairfax County Public Schools", "K-12 District", "Education", "K-12", "Fairfax", "VA", "Identified", 180000, null, 198, 1440000, "Existing List");

    // Charter Schools (8)
    addProspect("KIPP Foundation", "Charter School", "Education", "Charter", "San Francisco", "CA", "Discovery", 120000, null, 270, 1200000, "Existing List");
    addProspect("Success Academy", "Charter School", "Education", "Charter", "New York", "NY", "Qualified", 20000, null, 53, 200000, "Referral");
    addProspect("Uncommon Schools", "Charter School", "Education", "Charter", "Newark", "NJ", "Identified", 20000, null, 54, 200000, "Existing List");
    addProspect("Achievement First", "Charter School", "Education", "Charter", "New Haven", "CT", "Outreach Sent", 15000, null, 41, 150000, "Existing List");
    addProspect("Aspire Public Schools", "Charter School", "Education", "Charter", "Oakland", "CA", "Demo Scheduled", 16000, null, 36, 160000, "Referral");
    addProspect("IDEA Public Schools", "Charter School", "Education", "Charter", "Weslaco", "TX", "Intro Scheduled", 75000, null, 137, 750000, "Conference");
    addProspect("Noble Network of Charter Schools", "Charter School", "Education", "Charter", "Chicago", "IL", "Discovery", 12000, null, 18, 120000, "Partner");
    addProspect("Mastery Charter Schools", "Charter School", "Education", "Charter", "Philadelphia", "PA", "Identified", 14000, null, 24, 140000, "Existing List");

    // Private Schools (6)
    addProspect("Phillips Academy Andover", "Private School", "Education", "Private", "Andover", "MA", "Identified", 1150, null, null, 28750, "Existing List");
    addProspect("Choate Rosemary Hall", "Private School", "Education", "Private", "Wallingford", "CT", "Researching", 862, null, null, 21550, "Existing List");
    addProspect("Lakeside School", "Private School", "Education", "Private", "Seattle", "WA", "Outreach Sent", 850, null, null, 21250, "Cold Outreach");
    addProspect("Trinity School", "Private School", "Education", "Private", "New York", "NY", "Discovery", 990, null, null, 24750, "Referral");
    addProspect("Sidwell Friends School", "Private School", "Education", "Private", "Washington", "DC", "Identified", 1140, null, null, 28500, "Existing List");
    addProspect("Latin School of Chicago", "Private School", "Education", "Private", "Chicago", "IL", "Demo Scheduled", 1120, null, null, 28000, "Inbound Website");

    // Universities (12)
    addProspect("University of Wisconsin-Madison", "University", "Education", "Athletics", "Madison", "WI", "Pilot Active", 47000, null, null, 50000, "Existing Client");
    addProspect("Ohio State University", "University", "Education", "Athletics", "Columbus", "OH", "Discovery", 61000, null, null, 50000, "Conference");
    addProspect("University of Michigan", "University", "Education", "Athletics", "Ann Arbor", "MI", "Intro Scheduled", 47000, null, null, 50000, "Referral");
    addProspect("Penn State University", "University", "Education", "Higher Ed", "University Park", "PA", "Identified", 46000, null, null, 230000, "Existing List");
    addProspect("Arizona State University", "University", "Education", "Higher Ed", "Tempe", "AZ", "Researching", 77000, null, null, 385000, "Existing List");
    addProspect("Georgia Tech", "University", "Education", "Higher Ed", "Atlanta", "GA", "Outreach Sent", 44000, null, null, 220000, "Cold Outreach");
    addProspect("University of Texas at Austin", "University", "Education", "Athletics", "Austin", "TX", "Identified", 52000, null, null, 50000, "Conference");
    addProspect("Stanford University", "University", "Education", "Higher Ed", "Stanford", "CA", "Identified", 17000, null, null, 85000, "Existing List");
    addProspect("MIT", "University", "Education", "Higher Ed", "Cambridge", "MA", "Researching", 11000, null, null, 55000, "Existing List");
    addProspect("City Colleges of Chicago", "Community College", "Education", "Community College", "Chicago", "IL", "Discovery", 65000, null, null, 325000, "Partner");
    addProspect("Maricopa County CC District", "Community College", "Education", "Community College", "Phoenix", "AZ", "Identified", 150000, null, null, 750000, "Existing List");
    addProspect("Miami Dade College", "Community College", "Education", "Community College", "Miami", "FL", "Outreach Sent", 120000, null, null, 600000, "Existing List");

    // Corporate L&D (6)
    addProspect("Deloitte", "Corporate L&D", "Corporate", "Professional Dev", "Chicago", "IL", "Identified", null, 175000, null, 350000, "Existing List");
    addProspect("McKinsey & Company", "Corporate L&D", "Corporate", "Professional Dev", "New York", "NY", "Researching", null, 45000, null, 90000, "Existing List");
    addProspect("PwC", "Corporate L&D", "Corporate", "Professional Dev", "New York", "NY", "Identified", null, 85000, null, 170000, "Existing List");
    addProspect("Accenture", "Corporate L&D", "Corporate", "Professional Dev", "Chicago", "IL", "Outreach Sent", null, 150000, null, 300000, "Cold Outreach");
    addProspect("JP Morgan Chase", "Corporate L&D", "Corporate", "Professional Dev", "New York", "NY", "Identified", null, 293000, null, 500000, "Existing List");
    addProspect("Google", "Corporate L&D", "Corporate", "Professional Dev", "Mountain View", "CA", "Researching", null, 182000, null, 364000, "Existing List");

    await db.insert(salesProspects).values(seeds);
    res.json({ success: true, count: seeds.length });
  } catch (err: any) { console.error("Seed error:", err); res.status(500).json({ error: err.message }); }
});

function getRegion(state: string): string {
  const r: Record<string, string> = {
    CT: "Northeast", MA: "Northeast", NJ: "Northeast", NY: "Northeast", PA: "Northeast", DC: "Northeast",
    FL: "Southeast", GA: "Southeast", VA: "Southeast",
    IL: "Midwest", MI: "Midwest", MN: "Midwest", OH: "Midwest", WI: "Midwest",
    AZ: "Southwest", CO: "Southwest", NV: "Southwest", TX: "Southwest",
    CA: "West", OR: "West", WA: "West",
  };
  return r[state] || "National";
}

function getStageProbability(stage: string): number {
  const p: Record<string, number> = {
    "Identified": 5, "Researching": 5, "Outreach Sent": 10, "Intro Scheduled": 15,
    "Discovery": 20, "Qualified": 30, "Demo Scheduled": 35, "Demo Completed": 40,
    "Needs Analysis": 45, "Proposal In Progress": 50, "Proposal Sent": 55,
    "Pilot Discussion": 60, "Pilot Active": 70, "Pilot Review": 75,
    "Procurement Review": 80, "Contract Sent": 85, "Contract Review": 90,
    "Verbal Commit": 95, "Closed Won": 100, "Closed Lost": 0, "Nurture / Deferred": 5,
  };
  return p[stage] || 10;
}

function getForecastCategory(stage: string): string {
  if (stage === "Closed Won") return "Closed Won";
  if (stage === "Closed Lost") return "Closed Lost";
  if (["Verbal Commit", "Contract Review", "Contract Sent"].includes(stage)) return "Commit";
  if (["Procurement Review", "Pilot Active", "Pilot Review", "Proposal Sent"].includes(stage)) return "Best Case";
  return "Pipeline";
}

export default router;
