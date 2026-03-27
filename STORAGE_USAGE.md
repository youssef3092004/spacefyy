# 📊 Storage Usage Tracking Guide

## Overview

The storage usage tracking system monitors how many resources (branches, spaces, devices, tools, staff, users) each business has created and enforces plan-based limits.

## Models

### `StorageUsage`

- **Purpose**: Stores the current usage and limits of a business
- **Key Fields**:
  - `currentBranches`, `currentSpaces`, `currentDevices`, `currentTools`, `currentStaff`, `currentUsers` - actual counts
  - `maxBranches`, `maxSpaces`, `maxDevices`, `maxTools`, `maxStaff`, `maxUsers` - limits from plan
  - `*UsagePercent` - percentage usage for each resource type

### `StorageUsageHistory`

- **Purpose**: Records snapshots of storage usage for day-to-day analytics
- **Key Fields**:
  - `storageUsageId` - reference to StorageUsage
  - `businessId` - reference to Business
  - `branches`, `spaces`, `devices`, `tools`, `staff`, `users` - snapshot counts at time of recording
  - `recordedAt` - timestamp of the snapshot

## Performance Strategy

### ⚡ Fast Approach: Increment/Decrement (RECOMMENDED)

- Use `incrementStorageUsage()` when creating a resource
- Use `decrementStorageUsage()` when deleting a resource
- **Benefits**:
  - Single UPDATE query
  - No delays
  - Minimal database load
  - Real-time counter updates

### 🐢 Slow Approach: Full Recount

- Use `updateStorageUsage()` only for:
  - Data auditing/synchronization
  - Fixing inconsistencies
  - After plan limit changes
- **Drawbacks**:
  - 6 COUNT queries per call
  - Noticeable delays
  - High database load

### Performance Comparison

| Operation       | Old Method (Full Recount)                     | New Method (Inc/Dec)                |
| --------------- | --------------------------------------------- | ----------------------------------- |
| **DB Queries**  | 1 SELECT + 6 COUNT + 1 UPDATE = **8 queries** | 1 SELECT + 1 UPDATE = **2 queries** |
| **Speed**       | Slow (~100-500ms)                             | Fast (~10-50ms)                     |
| **Scalability** | Gets slower as data grows                     | Constant O(1) speed                 |
| **Best For**    | Auditing, fixing errors                       | Real-time create/delete             |

### Example Usage Comparison

```javascript
// ❌ OLD WAY (Slow - don't use for create/delete)
await prisma.branch.create({ data });
await updateStorageUsage(businessId); // Counts ALL branches, spaces, devices, etc.

// ✅ NEW WAY (Safe & Fast - use for create/delete)
await prisma.branch.create({ data });
await incrementStorageUsage(businessId, "branches"); // Checks limit + increments (+1)
// If limit exceeded, throws error before incrementing

// ❌ OLD WAY (Slow - don't use for delete)
await prisma.branch.delete({ where: { id } });
await updateStorageUsage(businessId); // Counts ALL resources again

// ✅ NEW WAY (Fast - use for delete)
await prisma.branch.delete({ where: { id } });
await decrementStorageUsage(businessId, "branches"); // Just -1
```

## How to Integrate

### 1. Initialize Storage Usage When Creating a Business

In `controllers/business.js`, add this to `createBusiness`:

```javascript
import { initializeStorageUsage } from "../utils/storageUsage.js";

export const createBusiness = async (req, res, next) => {
  try {
    // ... existing code ...

    const business = await prisma.business.create({
      data: {
        name,
        ownerId,
        planId,
      },
    });

    // Initialize storage tracking
    await initializeStorageUsage(business.id);

    res.status(201).json({
      status: "success",
      data: business,
    });
  } catch (error) {
    next(error);
  }
};
```

### 2. Creating Resources (Automatic Limit Check)

In `controllers/branch.js`, add this to `createBranch`:

```javascript
import { incrementStorageUsage } from "../utils/storageUsage.js";

export const createBranch = async (req, res, next) => {
  try {
    const { businessId } = req.body;

    // ... existing creation code ...

    const branch = await prisma.branch.create({
      data: {
        /* ... */
      },
    });

    // ✅ SAFE & FAST: Checks limit automatically, then increments
    // Will throw 403 error if limit exceeded
    await incrementStorageUsage(businessId, "branches");

    res.status(201).json({
      status: "success",
      data: branch,
    });
  } catch (error) {
    next(error);
  }
};
```

**⚠️ Important**: `incrementStorageUsage()` now checks the plan limit automatically. If the current count equals or exceeds the max limit (e.g., 10/10), it throws a 403 error **before** incrementing. This prevents going over the limit (like 11/10).

### 3. Update Storage on Delete

In any delete controller function, call `decrementStorageUsage`:

```javascript
import { decrementStorageUsage } from "../utils/storageUsage.js";

export const deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id },
      select: { businessId: true },
    });

    if (!branch) return next(new AppError("Branch not found", 404));

    await prisma.branch.delete({ where: { id } });

    // ✅ FAST: Decrement counter by 1 (no delay)
    await decrementStorageUsage(branch.businessId, "branches");

    res.status(200).json({
      status: "success",
      message: "Branch deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
```

### 4. Sync Storage Usage (When Needed)

Use `updateStorageUsage()` only for special cases:

- Fixing inconsistencies
- Auditing data
- After plan changes

```javascript
import { updateStorageUsage } from "../utils/storageUsage.js";

// Full recount (slower, use only when needed)
await updateStorageUsage(businessId);
```

### 5. Check Limits Without Creating (Optional)

Use `checkResourceLimit()` if you want to check limits without creating/incrementing (e.g., for UI warnings):

```javascript
import { checkResourceLimit } from "../utils/storageUsage.js";

// Check if user can create more branches
const limitCheck = await checkResourceLimit(businessId, "branches");

if (!limitCheck.allowed) {
  // Show warning: "You've reached your plan limit"
  console.log(limitCheck.message);
} else {
  // Show available: "3 of 10 branches used"
  console.log(`${limitCheck.current} of ${limitCheck.max} used`);
}
```

**Note**: This is optional! `incrementStorageUsage()` already checks limits automatically.

### 6. Record Usage Snapshots (Optional - for Analytics)

You can set up a cron job to record snapshots periodically:

```javascript
import { recordStorageSnapshot } from "./utils/storageUsage.js";

// Record daily snapshots
const recordDailySnapshots = async () => {
  const businesses = await prisma.business.findMany();

  for (const business of businesses) {
    try {
      await recordStorageSnapshot(business.id);
    } catch (error) {
      console.error(
        `Failed to record snapshot for business ${business.id}:`,
        error,
      );
    }
  }
};

// Run at midnight
schedule.scheduleJob("0 0 * * *", recordDailySnapshots);
```

## API Endpoints

### Get Storage Usage Summary

```
GET /api/storage-usage/:businessId
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "businessId": "uuid",
    "resources": {
      "branches": {
        "current": 2,
        "max": 5,
        "usagePercent": 40
      },
      "spaces": {
        "current": 8,
        "max": 20,
        "usagePercent": 40
      },
      "devices": {
        "current": 15,
        "max": 50,
        "usagePercent": 30
      },
      "tools": {
        "current": 12,
        "max": 100,
        "usagePercent": 12
      },
      "staff": {
        "current": 3,
        "max": 10,
        "usagePercent": 30
      },
      "users": {
        "current": 5,
        "max": 10,
        "usagePercent": 50
      }
    },
    "lastUpdated": "2026-02-16T10:30:00Z"
  }
}
```

### Check Resource Limit

```
GET /api/storage-usage/:businessId/check/:resourceType
```

**Resource Types**: `branches`, `spaces`, `devices`, `tools`, `staff`, `users`

**Response (When Allowed):**

```json
{
  "status": "success",
  "message": "Resource creation allowed",
  "data": {
    "allowed": true,
    "current": 2,
    "max": 5,
    "availableSlots": 3
  }
}
```

**Response (When Limit Reached):**

```json
{
  "status": "error",
  "message": "Maximum branches limit (5) reached",
  "data": {
    "current": 5,
    "max": 5
  }
}
```

### Get Usage History

```
GET /api/storage-usage/:businessId/history?days=30
```

**Response:**

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "storageUsageId": "uuid",
      "businessId": "uuid",
      "branches": 1,
      "spaces": 4,
      "devices": 10,
      "tools": 8,
      "staff": 2,
      "users": 3,
      "recordedAt": "2026-02-15T00:00:00Z"
    }
    // ... more records
  ],
  "period": "Last 30 days"
}
```

### Manually Update Storage Usage

```
POST /api/storage-usage/:businessId/update
```

**Response:**

```json
{
  "status": "success",
  "message": "Storage usage updated successfully",
  "data": {
    /* ... summary ... */
  }
}
```

### Get All Businesses Storage (Admin Only)

```
GET /api/storage-usage/admin/all
```

**Response:**

```json
{
  "status": "success",
  "data": [
    {
      "businessId": "uuid",
      "businessName": "Acme Gaming",
      "ownerEmail": "owner@acme.com",
      "planType": "PRO",
      "resources": {
        /* ... */
      },
      "lastUpdated": "2026-02-16T10:30:00Z"
    }
    // ... more businesses
  ],
  "total": 15
}
```

## Integration Checklist

- [ ] Add storage usage initialization when creating a business
- [ ] Add limit checks before creating branches, spaces, devices, tools
- [ ] Call `incrementStorageUsage` after create operations (FAST)
- [ ] Call `decrementStorageUsage` after delete operations (FAST)
- [ ] (Optional) Set up cron job for daily snapshots
- [ ] Run Prisma migration: `npx prisma migrate dev`
- [ ] Add storage routes to main Express server

## Example Usage Flow

1. **Create Business** → Initialize StorageUsage record
2. **Create Branch** → Check limit → Create → **Increment** storage count (+1)
3. **Create Space** → Check limit → Create → **Increment** storage count (+1)
4. **Delete Space** → Delete → **Decrement** storage count (-1)
5. **Check Usage** → Query `/api/storage-usage/:businessId`
6. **Upgrade Plan** → Plan limits automatically apply on next update

## Best Practices

✅ **DO**:

- Check limits before creating resources
- Use `incrementStorageUsage()` after create operations (fast!)
- Use `decrementStorageUsage()` after delete operations (fast!)
- Use the utility functions for consistency
- Record snapshots for growth analytics
- Pre-warn users when approaching limits (e.g., 80% usage)

❌ **DON'T**:

- Use `updateStorageUsage()` for create/delete (too slow!)
- Manually edit StorageUsage records
- Call updateStorageUsage multiple times consecutively
- Rely on StorageUsage as the source of truth (it's a cache of actual counts)
- Forget to initialize storage for new businesses

## Quick Reference

| Resource Type | On Create                                       | On Delete                                       |
| ------------- | ----------------------------------------------- | ----------------------------------------------- |
| Branch        | `incrementStorageUsage(businessId, "branches")` | `decrementStorageUsage(businessId, "branches")` |
| Space         | `incrementStorageUsage(businessId, "spaces")`   | `decrementStorageUsage(businessId, "spaces")`   |
| Device        | `incrementStorageUsage(businessId, "devices")`  | `decrementStorageUsage(businessId, "devices")`  |
| Tool          | `incrementStorageUsage(businessId, "tools")`    | `decrementStorageUsage(businessId, "tools")`    |
| Staff         | `incrementStorageUsage(businessId, "staff")`    | `decrementStorageUsage(businessId, "staff")`    |
| User          | `incrementStorageUsage(businessId, "users")`    | `decrementStorageUsage(businessId, "users")`    |

- Forget to initialize storage for new businesses
