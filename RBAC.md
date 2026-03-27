# RBAC (Role-Based Access Control) System

## Permission Priority Order

The system enforces a strict hierarchy when checking permissions:

### 1. **OWNER / DEVELOPER**

- Full access - bypasses all DB checks
- No restrictions applied

### 2. **BranchUserPermission** (Most Specific)

- User + Branch scope
- Used when action targets a specific branch
- Can explicitly allow or deny (`isAllowed: true/false`)

### 3. **UserPermission** (User Override)

- User scope only
- Can override role defaults
- Can explicitly allow or deny (`isAllowed: true/false`)

### 4. **RolePermission** (Role Defaults)

- Role scope - applies to all users with that role
- Presence = allowed (no `isAllowed` field needed)

### 5. **Deny by Default**

- If none of the above grant permission → **403 Forbidden**

## Permission Naming Convention

All permissions follow this format:

- **Action-Resource**: `CREATE-BRANCHES`, `UPDATE-DEVICES`, `DELETE-USERS`
- **No spaces, uppercase only**
- **Hyphen-separated**: `VIEW-ROLE-PERMISSIONS`

## When to Use Branch Permissions

| Scenario                  | Use Branch Permission? | Example                              |
| ------------------------- | ---------------------- | ------------------------------------ |
| Action targets a branch   | ✅ YES                 | Create device in branch              |
| Action is global          | ❌ NO                  | Create business                      |
| Admin override per branch | ✅ YES                 | Deny staff access to specific branch |
| Global user override      | ❌ NO                  | Super user feature                   |

## Middleware Usage

### Global Permission Check

```javascript
router.post("/create", checkPermission("CREATE-BRANCHES"), controller);
```

### Branch-Scoped Permission Check

```javascript
router.post("/create", checkPermission("CREATE-DEVICES", true), controller);

// branchId can be in: params, body, or query
// req.branchId will be available in controller
```

## Database Schema

### Permission Models (Immutable)

**Permission**

- id (PK)
- name (UNIQUE)
- description

**RolePermission**

- id (PK)
- roleId (FK)
- permissionId (FK)
- **UNIQUE(roleId, permissionId)** ← Prevents duplicates

**UserPermission**

- id (PK)
- userId (FK)
- permissionId (FK)
- isAllowed (BOOLEAN, default: false)
- **UNIQUE(userId, permissionId)** ← Prevents duplicates

**BranchUserPermission**

- id (PK)
- userId (FK)
- branchId (FK)
- permissionId (FK)
- isAllowed (BOOLEAN, default: true)
- **UNIQUE(userId, branchId, permissionId)** ← Prevents duplicates

## How to Use hasPermission Function

### Basic Usage

```javascript
import { hasPermission } from "../utils/hasPermission.js";

const allowed = await hasPermission(
  userId,
  roleId,
  roleName,
  "CREATE-BRANCHES",
);

if (!allowed) throw new Error("Access denied");
```

### With Branch Scope

```javascript
const allowed = await hasPermission(
  userId,
  roleId,
  roleName,
  "CREATE-DEVICES",
  branchId, // Optional 4th param
);
```

### Check Multiple Permissions (ALL required)

```javascript
import { hasAllPermissions } from "../utils/hasPermission.js";

const allowed = await hasAllPermissions(
  userId,
  roleId,
  roleName,
  ["CREATE-BRANCHES", "VIEW-DEVICES"],
  branchId,
);
```

### Check Multiple Permissions (ANY required)

```javascript
import { hasAnyPermission } from "../utils/hasPermission.js";

const allowed = await hasAnyPermission(
  userId,
  roleId,
  roleName,
  ["ADMIN", "MANAGER"],
  branchId,
);
```

## Test Scenarios

### Owner User

```javascript
// Always allowed
await hasPermission(ownerId, roleId, "OWNER", "ANY-PERMISSION"); // → true
```

### Admin with Role Permission

```javascript
// Allowed via RolePermission
await hasPermission(adminId, adminRoleId, "ADMIN", "CREATE-BRANCHES"); // → true
```

### Staff with Branch Override

```javascript
// Denied via BranchUserPermission (isAllowed: false)
await hasPermission(
  staffId,
  staffRoleId,
  "STAFF",
  "CREATE-DEVICES",
  specificBranchId,
); // → false (if BranchUserPermission.isAllowed = false)
```

### Staff with User Override

```javascript
// Allowed via UserPermission override (even if role denies)
await hasPermission(staffId, staffRoleId, "STAFF", "VIEW-DEVICES"); // → true
```

### Denied User

```javascript
// Denied - no permission found anywhere
await hasPermission(userId, roleId, "CUSTOMER", "DELETE-USERS"); // → false
```

## Error Handling

| Case                         | Response                 |
| ---------------------------- | ------------------------ |
| No auth token                | 401 Unauthorized         |
| Permission not found         | 403 Forbidden            |
| Branch ID missing (required) | 400 Bad Request          |
| Database error               | 500 Error (with logging) |

## Future Enhancements

1. **Audit Logging**: Track all permission changes
2. **Permission Caching**: Redis cache for frequently checked permissions
3. **Dynamic Roles**: Allow runtime role creation
4. **Resource-Based ACL**: Add resource-level permissions
5. **Delegation**: Allow users to delegate permissions
