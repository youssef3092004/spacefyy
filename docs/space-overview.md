# Space Overview API

The live "floor view" of a branch — every space with its current busy/free state, who is using each resource, and top-line metrics. Backed by [controllers/spaceOverview.js](../controllers/spaceOverview.js).

Base URL: `/api/v1/spaces`

---

## Endpoint

### GET `/overview/:branchId`

Returns all spaces in a branch (no pagination). For PUBLIC spaces, the inner **devices** and **units** are included.

**Auth:** `verifyToken` + `VIEW-SPACES` permission + branch ownership.

---

## Response

```jsonc
{
  "status": "success",
  "data": {
    "analytics": {
      "activeVisits": 3,
      "spacesOccupied": 5,
      "spacesTotal": 13,
      "todayOrders": 12,
      "longestSessionSeconds": 8712,
      "longestSession": "2h 25m"
    },
    "spaces": [
      {
        "id": "uuid",
        "name": "VIP Room",
        "type": "VIP",
        "capacity": 1,
        "availableNumber": 0,
        "isActive": true,
        "isBusy": true,
        "customer": { "id": "uuid", "name": "Mohamed" },
        "visitId": "uuid"
      },
      {
        "id": "uuid",
        "name": "Gaming Hall",
        "type": "PUBLIC",
        "capacity": 20,
        "isBusy": false,
        "devices": [
          {
            "id": "uuid",
            "name": "PS5 Station 1",
            "type": "PS5_2",
            "isActive": true,
            "isBusy": true,
            "customer": { "id": "uuid", "name": "Ali" },
            "visitId": "uuid"
          }
        ],
        "units": []
      }
    ]
  }
}
```

---

## Analytics metrics

| Field | Meaning |
|---|---|
| `activeVisits` | Count of visits with status `ACTIVE` in the branch. |
| `spacesOccupied` | Number of **bookable units currently busy** (see counting rule below). |
| `spacesTotal` | Total number of **bookable units** in the branch (see counting rule below). |
| `todayOrders` | Orders created in the branch since midnight (local server time). |
| `longestSessionSeconds` | Longest session today by wall-clock time, in seconds. **Excludes `CANCELLED` sessions.** Ongoing (`ACTIVE`) sessions are measured up to "now". |
| `longestSession` | The same value pre-formatted for display, e.g. `"2h 25m"` (or `"25m"` / `"45s"`). Use this directly in the "Longest Session" card. |

The four dashboard cards map straight to these fields: **Active Visits** → `activeVisits`, **Spaces Occupied** → `spacesOccupied` / `spacesTotal`, **Today's Orders** → `todayOrders`, **Longest Session** → `longestSession`.

### How `spacesOccupied` / `spacesTotal` are counted

A **bookable unit** is what a customer actually occupies:

- A **non-PUBLIC space** (PRIVATE, MEETING, VIP, DESK, OTHER) is itself **one** bookable unit.
- A **PUBLIC space** is a container — it contributes its inner **devices + units** as the bookable units (the space itself is not counted).

So for each space:

| Space type | Adds to `spacesTotal` | Adds to `spacesOccupied` |
|---|---|---|
| Non-PUBLIC | `1` | `1` if the space `isBusy` |
| PUBLIC | `devices.length + units.length` | count of its devices + units where `isBusy` |

> Example: a branch with a Meeting Room, a VIP Room, a Private Playstation (3 non-public = 3), plus a PUBLIC "Gaming Hall" with 8 devices and a PUBLIC "Test" area with 2 units → `spacesTotal = 3 + 8 + 2 = 13`.

Occupancy is driven entirely by the live **`isBusy`** flag, which is kept in sync automatically as sessions start and end. An empty PUBLIC space (no devices/units) contributes `0`.

---

## Per-resource `customer` and `visitId`

Whenever a resource is **`isBusy: true`**, the overview attaches two extra fields so the frontend knows *who* is using it and *which visit* to open:

| Field | When present | Value |
|---|---|---|
| `customer` | resource `isBusy` | `{ id, name }` of the active visit's customer, or `{ id: "", name: "" }` for a walk-in with no customer |
| `visitId` | resource `isBusy` | id of the `ACTIVE` visit using the resource, or `null` if none maps |

Free resources (`isBusy: false`) carry neither field. The mapping only considers **live** components (`endedAt = null` on an `ACTIVE`, non-deleted session), so a finished session never attributes a phantom customer/visit to a freed resource.

---

## Single-use rule for non-PUBLIC spaces

Only PUBLIC spaces hold multiple resources and take a `capacity` from the client. **Every other space type is single-use:** its `capacity` is always `1` and any client-supplied value is ignored on create/update. This is what makes a non-PUBLIC space's `isBusy` mean "in use" (one slot, taken = busy). See [controllers/space.js](../controllers/space.js).

---

## Real-time updates (WebSocket)

The overview is pushed over Socket.IO — clients don't poll. Events are defined in [controllers/webSocketSpaceOverView.js](../controllers/webSocketSpaceOverView.js).

| Event | Direction | Payload |
|---|---|---|
| `space-overview:join` | client → server | `{ branchId }` — subscribe to a branch's room |
| `space-overview:leave` | client → server | `{ branchId }` — unsubscribe |
| `space-overview:updated` | server → client | `{ branchId, refreshedAt, ...payload }` |

An update is emitted to the branch room whenever a session or component changes (start / end / update) — see the `emitSpaceOverviewUpdate` calls in [controllers/session.js](../controllers/session.js) and [controllers/sessionComponent.js](../controllers/sessionComponent.js).

**Supporting REST endpoints** (`/api/v1/websocket-space-overview`, all `VIEW-SPACES` + branch-scoped):

| Method & path | Purpose |
|---|---|
| `GET /status/:branchId` | Report the socket event names and room for a branch |
| `POST /emit-live/:branchId` | Build the full overview and push it to the branch room |
| `POST /emit-test/:branchId` | Push a sample payload (debugging) |

> ⚠️ Socket.IO needs a long-running server process. It does not work on Vercel serverless functions — deploy the API on a persistent host if you rely on live overview updates.

---

## Data hygiene

Occupancy trusts the `isBusy` flag. If it ever drifts from reality (e.g. an interrupted transaction), run the reconciliation script to recompute every space/device/unit's `isBusy` (and normalize non-PUBLIC capacities to `1`) from the live sessions:

```bash
# preview (no writes)
node --env-file=.env scripts/reconcileResourceState.js
# apply
node --env-file=.env scripts/reconcileResourceState.js --apply
```

See [scripts/reconcileResourceState.js](../scripts/reconcileResourceState.js).
