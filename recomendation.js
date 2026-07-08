/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SPACEFY BACKEND — IMPROVEMENT RECOMMENDATIONS
 * Generated: 2026-07-05 (full project scan)
 *
 * This file is about ENGINEERING QUALITY & MAINTAINABILITY.
 * Pure security bugs live in task.js — this list avoids duplicating them and
 * focuses on process, architecture, consistency, and performance.
 *
 * Priority: P0 = do now, P1 = this sprint, P2 = when you get time.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const RECOMMENDATIONS = [
  // ═══════════════════════ P0 — DO NOW ═══════════════════════

  {
    id: 1,
    priority: "P0",
    area: "database / deploy safety",
    finding:
      ".gitignore contains '/prisma/migrations', but you HAVE 12 real migration " +
      "folders locally (baseline … add_invoice_status_in_order). They are being " +
      "excluded from git.",
    why:
      "Migrations are the source of truth for your DB schema history. If they are " +
      "not committed, teammates and production can't reproduce your database, and " +
      "'prisma migrate deploy' has nothing to apply. This is the single riskiest " +
      "thing in the repo right now.",
    action:
      "Remove '/prisma/migrations' from .gitignore, commit the whole migrations/ " +
      "folder, and standardize on 'prisma migrate' (not 'db push') going forward.",
  },

  {
    id: 2,
    priority: "P0",
    area: "repo hygiene",
    finding:
      "Tracked files that shouldn't be in git: seed.log, seed-output.log. " +
      "Two env files exist (.env and .env.local) with live credentials.",
    why: "Logs create noise/merge conflicts; any tracked secret is a leak waiting to happen.",
    action:
      "git rm --cached seed.log seed-output.log; add '*.log' to .gitignore. " +
      "Confirm .env.local is ignored (it is via '.env*.local'), and rotate any " +
      "credential that was ever committed.",
  },

  {
    id: 3,
    priority: "P0",
    area: "testing",
    finding:
      "There are ZERO automated tests (package.json 'test' just exits 1) across " +
      "34 controllers and 32 routes. fast-check is even installed but unused.",
    why:
      "Every change you make (like the recent invoice/cache and getMe work) is " +
      "verified only by hand. Money-touching flows (orders, invoices, discounts, " +
      "stock) MUST have regression tests.",
    action:
      "Add Vitest or Jest + supertest. Start with the highest-risk flows: " +
      "order create/stock decrement, discount math (applyBothDiscounts), invoice " +
      "pay, and the auth/permission middleware. Aim for the critical paths first, " +
      "not 100% coverage.",
  },

  // ═══════════════════════ P1 — THIS SPRINT ═══════════════════════

  {
    id: 4,
    priority: "P1",
    area: "input validation",
    finding:
      "Validation is hand-rolled and repeated in every controller (isValidName, " +
      "manual 'X is required' loops, Number() checks). Rules drift between endpoints.",
    why:
      "Repetition = inconsistency + bugs (e.g. nested fields like order items are " +
      "validated ad-hoc). The frontend already models schemas with Zod " +
      "(OrderSchema in the screenshots) — the backend should too.",
    action:
      "Introduce Zod on the backend. Define request schemas per route and a single " +
      "validate(schema) middleware. Delete the per-controller manual checks.",
  },

  {
    id: 5,
    priority: "P1",
    area: "API consistency",
    finding:
      "Response envelope is inconsistent: some endpoints return { status: 'success' } " +
      "(auth.js, deleteAllUsers), others { success: true } (orders, invoices). " +
      "cacheMiddleware and errorHandler have to special-case BOTH shapes " +
      "(body.status === 'success' || body.success === true).",
    why:
      "Clients must handle two formats; the caching layer's success-detection is " +
      "fragile because of it.",
    action:
      "Pick ONE envelope (recommend { success: boolean, data, message?, pagination? }) " +
      "and refactor all controllers + a response helper (res.ok(data) / res.fail()).",
  },

  {
    id: 6,
    priority: "P1",
    area: "architecture (thin controllers)",
    finding:
      "Business logic, Prisma queries, discount math, and cache invalidation all " +
      "live inside controllers. order.js and invoice.js already import helpers from " +
      "each other (applyBothDiscounts, closeVisitCore) — a sign the layering wants " +
      "to be extracted.",
    why:
      "Hard to test, hard to reuse, and cross-imports between controllers cause " +
      "circular-dependency risk.",
    action:
      "Introduce a services/ layer: controllers only parse req / send res; services " +
      "hold Prisma + business rules; a repositories layer optional. Move discount/" +
      "pricing/invoice logic there.",
  },

  {
    id: 7,
    priority: "P1",
    area: "caching strategy",
    finding:
      "Cache keys and TTL env names are scattered across route files as inline " +
      "strings ('TTL_BY_ID', 'TTL_BY_VISIT', 'TTL_LIST'). TTL_BY_VISIT isn't even " +
      "defined in .env, so those entries are cached with NO expiry (see task.js #16). " +
      "Invalidation is a mix of autoInvalidateCache middleware, manual " +
      "invalidateCacheByPattern calls, and raw redisClient.keys().",
    why:
      "This is exactly why you keep seeing stale data after paying an invoice. " +
      "Three different invalidation mechanisms with no single owner is unmaintainable.",
    action:
      "Centralize: one cacheKeys module (functions that build keys), one TTL config " +
      "object with sane DEFAULTS (never cache-forever on a missing env), and ONE " +
      "invalidation entry point per entity. Make cacheMiddleware ignore non-GET " +
      "requests defensively.",
  },

  {
    id: 8,
    priority: "P1",
    area: "performance (N+1 queries)",
    finding:
      "Sequential awaits in loops: enrichItems (order.js) does one product " +
      "findUnique PER item; addOrderItems then creates orderItems and decrements " +
      "stock in separate per-item awaits; cancelOrder / closeVisitCore loop " +
      "updates one row at a time.",
    why: "Latency scales linearly with item count and multiplies DB round-trips.",
    action:
      "Batch: findMany({ where: { id: { in: ids } } }) for products, createMany for " +
      "order items, and grouped/batched stock updates inside the transaction.",
  },

  {
    id: 9,
    priority: "P1",
    area: "observability",
    finding:
      "Logging is console.log/console.error only; no request IDs, no structured " +
      "logs, no /health or /ready endpoint, and no graceful shutdown (Redis/Prisma " +
      "connections aren't closed on SIGTERM).",
    why:
      "On Vercel/production you can't trace a request, and deploys can drop " +
      "in-flight connections.",
    action:
      "Add pino (or similar) with a request-id middleware, a GET /health that pings " +
      "DB+Redis, and a SIGTERM handler that closes prisma + redis before exit.",
  },

  // ═══════════════════════ P2 — WHEN YOU GET TIME ═══════════════════════

  {
    id: 10,
    priority: "P2",
    area: "repo cleanup",
    finding:
      "Dead / loose files at the project root: src/app.js is EMPTY and unreferenced; " +
      "fix.js, semiDemo.js, clearCacheHistory.js are one-off scripts sitting next to " +
      "server.js. task.js and recomendation.js (this file) are notes, not app code.",
    why: "Clutter makes it unclear what's real app code vs scratch.",
    action:
      "Delete src/app.js. Move one-off scripts into scripts/. Keep audit notes in a " +
      "/docs or /notes folder (or a markdown file) rather than importable .js at root.",
  },

  {
    id: 11,
    priority: "P2",
    area: "schema maintainability",
    finding:
      "prisma/schema.prisma is a single 979-line file with all models, enums, and " +
      "indexes.",
    why: "Large single-file schemas are hard to navigate and review.",
    action:
      "Prisma supports multi-file schemas (prisma/schema/*.prisma). Split by domain: " +
      "auth, catalog, visits/sessions, orders/invoices, staffing.",
  },

  {
    id: 12,
    priority: "P2",
    area: "CI/CD",
    finding: "No .github/workflows — lint, format, and (future) tests run only locally.",
    why: "Bad code can be pushed/deployed with no gate.",
    action:
      "Add a GitHub Actions workflow: install → prisma generate → eslint → prettier " +
      "--check → test. Block merges on failure.",
  },

  {
    id: 13,
    priority: "P2",
    area: "type safety",
    finding:
      "TypeScript is a devDependency and prisma.config.ts is TS, but the whole app " +
      "is plain .js — so you get Prisma's generated types but none of the safety in " +
      "your own code.",
    why: "Controllers pass around untyped req.body / Prisma results; easy to typo a field.",
    action:
      "Either migrate incrementally to TypeScript, or add JSDoc @typedef + " +
      "'// @ts-check' on the hottest modules to get editor-level checking for free.",
  },

  {
    id: 14,
    priority: "P2",
    area: "config validation",
    finding:
      "Env vars are read directly (process.env.JWT_SECRET, SALT_ROUNDS, TTL_*, " +
      "Redis creds) with no validation at boot. parseInt(process.env.SALT_ROUNDS) " +
      "silently becomes NaN if unset.",
    why: "Misconfiguration fails deep inside a request instead of loudly at startup.",
    action:
      "Validate all env vars once at boot with a Zod schema (configs/env.js) and " +
      "export a typed config object; crash fast if anything required is missing.",
  },

  {
    id: 15,
    priority: "P2",
    area: "documentation",
    finding:
      "Docs are spread across README.md, RBAC.md, STORAGE_USAGE.md, docs/*.md, and " +
      "two Postman/JSON files at root. No single API reference (e.g. OpenAPI/Swagger).",
    why: "Frontend integration relies on hand-written md that drifts from the code.",
    action:
      "Generate an OpenAPI spec (can be derived from the Zod schemas in rec #4) and " +
      "serve Swagger UI; keep the md files as guides, not the contract.",
  },
];

export const TOP_3_IF_YOU_ONLY_DO_THREE = [
  "1. Commit prisma/migrations (rec #1) — deploy correctness.",
  "2. Add tests for order/invoice/discount/auth flows (rec #3) — stop shipping blind.",
  "3. Centralize caching keys + TTL + invalidation (rec #7) — fixes the recurring stale-data bug for good.",
];
