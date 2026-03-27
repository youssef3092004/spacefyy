// Vercel CLI 50.4.2
// 🔍  Inspect: https://vercel.com/youssef3092004s-projects/spacefy/8FqpaWBtvF3f6C6iiLjBg3kerQLw [4s]
// ✅  Production: https://spacefy-8ns9lnm4o-youssef3092004s-projects.vercel.app [21s]
// 🔗  Aliased: https://spacefy-six.vercel.app [21s]

//! mange the auto payroll
//! Here you might want to integrate with an actual payment gateway & make the expenses record
//! fix when i get a payroll i should to get the data for spacific branch or business and change the scope from payroll to branch

// fix the cache key for the getAllBranches to include all query params to avoid cache collision and make sure that the cache is working properly by adding source: "cache" in the response when the data is from cache and source: "database" when it's from database

export const FIX_ROADMAP = {
  criticalNow: [
    {
      id: "C1",
      title: "Fix broken lint script",
      why: "Current lint command is quoted in a way that matches no files, so CI/local lint can silently miss issues.",
      action: "Change package.json lint to: eslint . --ext .js,.mjs,.cjs",
      files: ["package.json"],
    },
    {
      id: "C2",
      title: "Normalize route file casing",
      why: "BusinessSettings route uses uppercase file name while other files are lowercase, which can cause cross-platform or team merge confusion.",
      action:
        "Rename routes/BusinessSettings.js to routes/businessSettings.js and update import in server.js.",
      files: ["routes/BusinessSettings.js", "server.js"],
    },
    {
      id: "C3",
      title: "Remove duplicate JSON body parser",
      why: "express.json() is registered twice in server.js; this adds unnecessary parsing overhead.",
      action:
        "Keep one express.json call with size limit and remove the duplicate.",
      files: ["server.js"],
    },
    {
      id: "C4",
      title: "Use transaction for user + staff profile creation",
      why: "Two-step writes can leave partial data if second write fails.",
      action:
        "Wrap prisma.user.create + prisma.staffProfile.create in prisma.$transaction in registerAdmin/registerStaff.",
      files: ["controllers/auth.js"],
    },
  ],

  stabilityAndConflicts: [
    {
      id: "S1",
      title: "Avoid hardcoded role IDs",
      why: "Hardcoded UUIDs can break after reseeding/migration and create environment mismatch conflicts.",
      action:
        "Resolve role by enum/name (OWNER, ADMIN, STAFF, DEVELOPER) at runtime or via seed constants.",
      files: ["controllers/auth.js", "seeds/permissions.js"],
    },
    {
      id: "S2",
      title: "Harden cache middleware (fail-open)",
      why: "If Redis fails, requests should continue without cache to prevent user-facing outages.",
      action:
        "Catch Redis read/write errors inside middleware and continue response flow with source: database.",
      files: ["middleware/cache.js"],
    },
    {
      id: "S3",
      title: "Standardize naming and typo cleanup",
      why: "Typos (e.g. exsistToken) reduce maintainability and increase merge conflicts.",
      action:
        "Rename ambiguous variables and keep naming conventions consistent.",
      files: ["middleware/auth.js", "controllers/*", "utils/*"],
    },
    {
      id: "S4",
      title: "Add unique constraints review",
      why: "Duplicate records in permissions/relations can lead to hidden auth behavior conflicts.",
      action:
        "Ensure all permission relation tables have expected @@unique constraints and matching query assumptions.",
      files: ["prisma/schema.prisma", "utils/hasPermission.js"],
    },
  ],

  performanceHighImpact: [
    {
      id: "P1",
      title: "Cache permission resolution",
      why: "Each permission check can hit DB multiple times, increasing latency under load.",
      action:
        "Cache (userId, roleId, branchId, permissionName) decision in Redis with short TTL and invalidate on permission updates.",
      files: [
        "utils/hasPermission.js",
        "middleware/checkPermission.js",
        "utils/cacheInvalidation.js",
      ],
    },
    {
      id: "P2",
      title: "Batch role/permission lookups",
      why: "Repeated findUnique/findFirst calls can be reduced to fewer queries.",
      action:
        "Preload permission ID map by name and use a single combined query path when possible.",
      files: ["utils/hasPermission.js", "controllers/permission.js"],
    },
    {
      id: "P3",
      title: "Use token JTI + Redis for logout",
      why: "DB lookup on every request for blacklisted tokens is expensive at scale.",
      action:
        "Issue JWT with jti and store revoked JTIs in Redis with exp-aligned TTL; fallback to DB if needed.",
      files: ["controllers/auth.js", "middleware/auth.js", "configs/redis.js"],
    },
    {
      id: "P4",
      title: "Improve cache keys for list endpoints",
      why: "Missing query params in keys causes collisions and wrong data responses.",
      action:
        "Build deterministic keys using branchId + pagination + sort + filters for all getAll endpoints.",
      files: [
        "controllers/branch.js",
        "controllers/space.js",
        "middleware/cache.js",
      ],
    },
  ],

  userValueFeatures: [
    {
      id: "U1",
      title: "Refresh token + multi-session management",
      why: "Better security and user experience than single short-lived access token only.",
      action:
        "Add refresh token endpoint, per-device session table, and forced logout per device/all devices.",
      files: ["controllers/auth.js", "routes/auth.js", "prisma/schema.prisma"],
    },
    {
      id: "U2",
      title: "Audit log for sensitive actions",
      why: "Improves trust, debugging, and accountability for permission/payroll changes.",
      action:
        "Track who changed roles/permissions/payroll, when, and from which branch/business context.",
      files: ["controllers/*", "prisma/schema.prisma"],
    },
    {
      id: "U3",
      title: "Background payroll generation and approval workflow",
      why: "Prevents API timeouts and gives predictable payroll processing UX.",
      action:
        "Create payroll jobs queue + status endpoint + async notifications to admins.",
      files: [
        "controllers/payroll.js",
        "routes/payroll.js",
        "configs/redis.js",
      ],
    },
    {
      id: "U4",
      title: "Full search/filter/pagination consistency",
      why: "Users can navigate large data faster and API response size stays controlled.",
      action:
        "Apply common pagination and filter contract to users, branches, spaces, devices, tools.",
      files: ["utils/pagination.js", "controllers/*"],
    },
  ],

  securityAndOps: [
    {
      id: "O1",
      title: "Restrict CORS by environment",
      why: "Open CORS in production can expose API to unauthorized origins.",
      action: "Use allowlist from env and strict credentials/origin config.",
      files: ["server.js"],
    },
    {
      id: "O2",
      title: "Rate-limit auth and expensive endpoints",
      why: "Protects from brute force and abuse.",
      action: "Apply express-rate-limit per route group with sensible windows.",
      files: ["server.js", "routes/auth.js", "routes/payroll.js"],
    },
    {
      id: "O3",
      title: "Add health/readiness endpoints",
      why: "Improves deployment reliability and faster incident detection.",
      action: "Expose /health and /ready including DB + Redis checks.",
      files: ["server.js", "configs/db.js", "configs/redis.js"],
    },
    {
      id: "O4",
      title: "Enable minimal test coverage",
      why: "Current test script is placeholder and gives no confidence before deploy.",
      action:
        "Add smoke tests for auth login/register, permission checks, and one payroll path.",
      files: ["package.json", "tests/*"],
    },
  ],
};

export const IMPLEMENT_FIRST = ["C1", "C2", "C3", "C4", "P1", "P4", "O2", "U1"];

export default {
  FIX_ROADMAP,
  IMPLEMENT_FIRST,
};
