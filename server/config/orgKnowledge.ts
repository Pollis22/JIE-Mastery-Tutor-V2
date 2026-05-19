/**
 * Org Knowledge Loader
 * ────────────────────────────────────────────────────────────────────
 * Loads a per-site organization knowledge file (`server/config/org-knowledge.md`)
 * once at first call and caches the formatted prompt block in memory.
 *
 * Used by `buildSystemPrompt()` in ai-service.ts to prepend org-wide shared
 * knowledge (creed, principles, public history, identity terms) to every
 * tutor session on this site. The block becomes part of the prompt-cached
 * system prompt, so there is no per-turn cost beyond the first cache write.
 *
 * Behavior:
 *   - Disabled by default. Enable with env var `ORG_KNOWLEDGE_ENABLED=true`.
 *   - If the env var is unset/false → returns "" (no-op, fully backwards-compatible).
 *   - If the env var is true but the file is missing or empty → returns "" with a log.
 *   - On success → returns a clearly-delimited block ready to be prepended to a system prompt.
 *
 * One-line rule:
 *   Static, org-wide, public knowledge ONLY. Per-student data belongs in LSIS,
 *   not here. Confidential org content (e.g. fraternity ritual) MUST be excluded
 *   from the .md file itself; this loader does not police content.
 *
 * Version: v1 · May 6 2026
 */

import fs from "fs";
import path from "path";

let cached: string | null = null;
let initialized = false;

const KNOWLEDGE_FILE_PATH = path.join(
  process.cwd(),
  "server",
  "config",
  "org-knowledge.md"
);

/**
 * Returns the formatted org-knowledge block for prepending to a system prompt,
 * or "" if disabled / missing / empty. Memoized after the first call.
 */
export function getOrgKnowledgeBlock(): string {
  if (initialized) return cached || "";
  initialized = true;

  const enabled =
    String(process.env.ORG_KNOWLEDGE_ENABLED || "").toLowerCase() === "true";

  if (!enabled) {
    console.log(
      "[OrgKnowledge] Disabled (set ORG_KNOWLEDGE_ENABLED=true to activate)."
    );
    cached = "";
    return cached;
  }

  try {
    if (!fs.existsSync(KNOWLEDGE_FILE_PATH)) {
      console.log(
        `[OrgKnowledge] No knowledge file at ${KNOWLEDGE_FILE_PATH} — skipping.`
      );
      cached = "";
      return cached;
    }

    const raw = fs.readFileSync(KNOWLEDGE_FILE_PATH, "utf-8").trim();
    if (!raw) {
      console.log("[OrgKnowledge] Knowledge file is empty — skipping.");
      cached = "";
      return cached;
    }

    cached =
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "🏛️ ORGANIZATION KNOWLEDGE (loaded for this site)\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      raw +
      "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

    console.log(
      `[OrgKnowledge] ✓ Loaded org-knowledge.md (${raw.length} chars from disk).`
    );
    return cached;
  } catch (err: any) {
    console.warn(
      `[OrgKnowledge] Failed to load (${err?.message || err}) — skipping.`
    );
    cached = "";
    return cached;
  }
}

/**
 * Test-only helper to clear the in-memory cache. Not used in production.
 */
export function _resetOrgKnowledgeCacheForTests(): void {
  cached = null;
  initialized = false;
}
