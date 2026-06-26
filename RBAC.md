# Authentication & Authorization

This document covers the full AuthN/AuthZ system in Spacefyy — how tokens are verified, how permissions are checked, and how resource ownership is enforced.

---

## Table of Contents

- [Authentication (verifyToken)](#authentication-verifytoken)
- [Middleware Chain on a Route](#middleware-chain-on-a-route)
- [Permission Check (checkPermission)](#permission-check-checkpermission)
- [Permission Resolution (hasPermission)](#permission-resolution-haspermission)
- [Ownership Check (checkOwnership)](#ownership-check-checkownership)
- [Branch Access (checkBranchAccess)](#branch-access-checkbranchaccess)
- [Role Behaviors Summary](#role-behaviors-summary)
- [Permission Priority Order](#permission-priority-order)
- [Permission Naming Convention](#permission-naming-convention)
- [Database Models](#database-models)
- [Error Reference](#error-reference)

---

## Authentication (verifyToken)

**File:** `middleware/auth.js`

Every protected route starts with `verifyToken`. It does the following in order:

1. Checks that the `Authorization` header exists and starts with `Bearer `.
2. Extracts the token from the header.
3. Looks up the token in the `BlacklistedToken` table — if found, rejects immediately with `401`. This is how logout is enforced.
4. Verifies the JWT signature against `JWT_SECRET`.
5. Attaches the decoded payload to `req.user`.

**`req.user` shape after verification:**

| Field | Description |
|---|---|
| `userId` | The authenticated user's ID |
| `roleId` | The user's role ID |
| `roleName` | The user's role name (`OWNER`, `STAFF`, etc.) |

**Token expiry** returns `401 Token expired, please login again`.  
**Invalid signature** returns `401 Invalid token`.  
**Blacklisted token** returns `401 Authorization denied: Token is Expired`.

---

## Middleware Chain on a Route

Most protected routes follow this exact order:

```
verifyToken → checkPermission → checkOwnership → controller
```

- `verifyToken` — confirms the user is logged in and attaches `req.user`
- `checkPermission` — confirms the user has the required permission (optionally scoped to a branch)
- `checkOwnership` — confirms the resource being accessed belongs to a branch the user can reach

Both `checkPermission` and `checkOwnership` are optional on some routes. `verifyToken` is always first.

**Example from the codebase:**

```js
router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-SESSIONS", true),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  createSession,
);
```

---

## Permission Check (checkPermission)

**File:** `middleware/checkPermission.js`

`checkPermission(permissionName, requireBranchId?)` is a middleware factory.

| Parameter | Type | Description |
|---|---|---|
| `permissionName` | `string` | The permission to check (e.g. `"CREATE-SESSIONS"`) |
| `requireBranchId` | `boolean` | If `true`, extracts `branchId` from params/body/query and passes it into the permission check |

**How it works:**

1. Reads `userId`, `roleId`, `roleName` from `req.user`.
2. If `requireBranchId` is `true`, looks for `branchId` in `req.params`, `req.body`, or `req.query` — returns `400` if missing (except for `OWNER` and `DEVELOPER` who skip this check).
3. Calls `hasPermission(userId, roleId, roleName, permissionName, branchId)`.
4. If denied, returns a formatted `403` message.
5. If approved and `branchId` was resolved, sets `req.branchId` for downstream use.

---

## Permission Resolution (hasPermission)

**File:** `utils/hasPermission.js`

`hasPermission(userId, roleId, roleName, permissionName, branchId?)` is the core permission engine. It resolves whether a user has a given permission by walking through a priority chain.

### Resolution order

```
1. OWNER or DEVELOPER → immediately return true
2. BranchUserPermission (userId + branchId + permissionId) → return isAllowed
3. UserPermission (userId + permissionId) → return isAllowed
4. RolePermission (roleId + permissionId) → return true if record exists
5. No match found → return false → 403
```

Each step short-circuits — if a match is found at any layer, the remaining layers are not checked.

**Permission ID caching:** Permission IDs are cached in a `Map` in memory after the first lookup. Since permission names never change at runtime, this cache is permanent and saves a DB round-trip on every subsequent check.

### hasAllPermissions

Checks that a user has **every** permission in a list. Returns `false` as soon as any one fails.

### hasAnyPermission

Checks that a user has **at least one** permission in a list. Returns `true` as soon as any one passes.

---

## Ownership Check (checkOwnership)

**File:** `middleware/checkOwnership.js`

`checkOwnership({ model, paramId, scope })` verifies that the resource being accessed belongs to a branch (or user, or business) the requesting user is allowed to reach.

| Option | Type | Description |
|---|---|---|
| `model` | `string` | The Prisma model name to look up (e.g. `"session"`, `"device"`, `"visit"`) |
| `paramId` | `string` | Where to find the resource ID — checks `req.params`, `req.body`, `req.query` in that order |
| `scope` | `string` | `"branch"`, `"user"`, or `"business"` |

### Supported models

| Model | How branchId is resolved | Special behaviour |
|---|---|---|
| `branch` | `resourceId` IS the `branchId` | Calls `checkBranchAccess` directly |
| `business` | Checks `resource.ownerId === userId` | Business scope only |
| `session` | `resource.branchId` | Uses `findFirst` with `deletedAt: null` filter |
| `sessionComponent` | `resource.branchId` | — |
| `visit` | `resource.branchId` | — |
| `device` | `resource.branchId` | — |
| `space` | `resource.branchId` | — |
| `unit` | `resource.branchId` | — |
| `equipment` | `resource.branchId` | — |
| `product` | `resource.branchId` | — |
| `categoryProduct` | `resource.branchId` | — |
| Any `scope: "user"` model | `resource.userId` or `resource.createdById` | Checks against `req.user.userId` |

### Role bypasses

| Role | Behaviour |
|---|---|
| `DEVELOPER` | Skips all ownership checks entirely |
| `OWNER` | Skips branch and user scope checks. Still goes through ownership check for `scope: "business"` |

### What gets set on the request

After a successful check, `checkOwnership` sets:

- `req.resourceId` — the resolved resource ID
- `req.branchId` — the resolved branch ID (for `scope: "branch"`)

### The three scopes

**`scope: "branch"`**
Looks up the resource, extracts its `branchId`, then calls `checkBranchAccess` to confirm the user can reach that branch.

**`scope: "user"`**
Looks up the resource, checks that `resource.userId` or `resource.createdById` matches `req.user.userId`. Used for user-owned records.

**`scope: "business"`**
Looks up the business, checks that `resource.ownerId` matches `req.user.userId`. Used for business-level operations.

---

## Branch Access (checkBranchAccess)

**File:** `utils/checkBranchAccess.js`

Called internally by `checkOwnership` when `scope: "branch"`. Determines whether a user can access a specific branch.

| Role | How access is determined |
|---|---|
| `OWNER` | Always allowed |
| `DEVELOPER` | Always allowed |
| `STAFF` | Must have a `StaffProfile` record with matching `userId` and `branchId` |
| `ADMIN`, `CUSTOMER`, others | Must have at least one `BranchUserPermission` record for that branch |

This means a `STAFF` user is implicitly authorized to any branch they are hired at (via their staff profile). For all other roles, access must be explicitly granted via a `BranchUserPermission` record.

---

## Role Behaviors Summary

| Role | hasPermission | checkOwnership (branch) | checkOwnership (business) |
|---|---|---|---|
| `DEVELOPER` | Always allowed | Bypassed | Bypassed |
| `OWNER` | Always allowed | Bypassed | Must own the business |
| `ADMIN` | Via BranchUserPermission → UserPermission → RolePermission | Via BranchUserPermission record |  n/a |
| `STAFF` | Via BranchUserPermission → UserPermission → RolePermission | Via StaffProfile record | n/a |
| `CUSTOMER` | Via BranchUserPermission → UserPermission → RolePermission | Via BranchUserPermission record | n/a |

---

## Permission Priority Order

```
1. OWNER / DEVELOPER          → always granted, no DB check
2. BranchUserPermission        → most specific: user + branch + permission (isAllowed: true/false)
3. UserPermission              → user-level override: user + permission (isAllowed: true/false)
4. RolePermission              → role default: role + permission (presence = allowed)
5. No match                    → 403 Forbidden
```

Both `BranchUserPermission` and `UserPermission` have an explicit `isAllowed` flag, meaning they can **grant or deny** a permission regardless of what the role says. `RolePermission` can only grant — its presence means allowed.

---

## Permission Naming Convention

All permission names follow this format:

```
ACTION-RESOURCE
```

- Uppercase only
- Hyphen-separated
- No spaces

**Examples:**

| Permission | Meaning |
|---|---|
| `CREATE-SESSIONS` | Create a session |
| `VIEW-SESSIONS` | View session records |
| `UPDATE-SESSIONS` | End, cancel, or update a session |
| `DELETE-SESSIONS` | Soft-delete a session |
| `CREATE-VISITS` | Start a visit |
| `VIEW-VISITS` | View visit records |
| `UPDATE-VISITS` | Close a visit |
| `CREATE-BRANCHES` | Create a branch |
| `VIEW-BRANCHES` | View branch data |
| `UPDATE-DEVICES` | Modify a device |
| `DELETE-USERS` | Delete a user record |
| `VIEW-ROLE-PERMISSIONS` | View which permissions a role has |

---

## Database Models

### Permission
```
id           String  @id
name         String  @unique
description  String
```
Immutable at runtime. Names are cached in memory after the first lookup.

### RolePermission
```
id           String  @id
roleId       String
permissionId String
UNIQUE(roleId, permissionId)
```
Presence of a record = the role has this permission. No `isAllowed` field — it either exists or not.

### UserPermission
```
id           String  @id
userId       String
permissionId String
isAllowed    Boolean  @default(false)
UNIQUE(userId, permissionId)
```
Can **grant or deny** a permission for a specific user, overriding their role's default.

### BranchUserPermission
```
id           String  @id
userId       String
branchId     String
permissionId String
isAllowed    Boolean  @default(true)
UNIQUE(userId, branchId, permissionId)
```
Most specific layer. Can **grant or deny** a permission for a specific user at a specific branch.

### BlacklistedToken
```
id        String  @id
token     String  @unique
expiredAt DateTime
```
Any token found here is immediately rejected by `verifyToken`, regardless of its JWT validity. Used to enforce logout.

---

## Error Reference

| Situation | Status | Message |
|---|---|---|
| No `Authorization` header | 401 | `Authorization header missing` |
| Header doesn't start with `Bearer ` | 401 | `Authorization header malformed` |
| Token is blacklisted | 401 | `Authorization denied: Token is Expired` |
| JWT expired | 401 | `Token expired, please login again` |
| JWT signature invalid | 401 | `Invalid token` |
| No `req.user` / `roleId` | 401 | `Unauthorized: You must be logged in...` |
| `roleName` missing from token | 403 | `Role not found in user session` |
| `branchId` required but missing | 400 | `branchId is required for permission: {name}` |
| Permission name not in DB | 404 | `Permission {name} not found` |
| Permission denied | 403 | `Forbidden: You do not have permission to perform {action}` |
| Resource not found in ownership check | 404 | `Resource not found` |
| Resource has no `branchId` | 400 | `Resource has no branch` |
| Branch access denied | 403 | `You do not have access to this branch` |
| Business ownership denied | 403 | `You do not own this business` |
| User ownership denied | 403 | `Forbidden` |
