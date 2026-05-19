# Order API Documentation

Base URL: `/api/v1/orders`

---

## Order Types

There are two types of orders in the system:

| Type | How to identify | When to use |
|------|----------------|-------------|
| **Visit order** | `isTakeaway: false`, has `visitId` | Customer is inside (workspace / PlayStation session) |
| **Takeaway order** | `isTakeaway: true`, `visitId: null` | Customer is taking items without a session |

---

## Data Model

```json
{
  "id": "uuid",
  "number": 5,
  "isTakeaway": true,
  "visitId": null,
  "branchId": "uuid",
  "customerId": "uuid",
  "status": "OPEN",
  "discount": {
    "customer": {
      "type": "PERCENT",
      "amount": 10
    },
    "order": {
      "type": "PERCENT",
      "amount": 15
    }
  },
  "totalPrice": 100.00,
  "finalPrice": 76.50,
  "itemCount": 3,
  "orderItems": [
    {
      "id": "uuid",
      "quantity": 2,
      "unitPrice": 25.00,
      "totalPrice": 50.00,
      "product": {
        "id": "uuid",
        "name": "Cola",
        "image": "https://...",
        "price": 25.00
      }
    }
  ],
  "createdAt": "2026-05-20T10:00:00.000Z",
  "updatedAt": "2026-05-20T10:05:00.000Z"
}
```

**Order statuses:** `OPEN`, `COMPLETED`

---

## Endpoints

### POST `/create`
Create a new order or add items to an existing open order.

**Smart behavior:**
- If `visitId` is provided → visit order. One order per visit. Sending items again adds to the same order.
- If `visitId` is not provided → takeaway order. Requires `branchId` in body.

**Body — Visit order:**
```json
{
  "visitId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 2 },
    { "productId": "uuid", "quantity": 1 }
  ],
  "discountType": "PERCENT",
  "discountAmount": 15
}
```

**Body — Takeaway order:**
```json
{
  "branchId": "uuid",
  "customerId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 1 }
  ],
  "discountType": "FLAT",
  "discountAmount": 20
}
```

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| `items` | Yes | Non-empty array of `{ productId, quantity }` |
| `visitId` | For visit orders | Visit must be `ACTIVE` |
| `branchId` | For takeaway | Required when no `visitId` |
| `customerId` | No | Optional for takeaway orders |
| `discountType` | No | `FLAT` or `PERCENT` — manual staff discount |
| `discountAmount` | No | Required if `discountType` is set |

**Response:** `201` on new order, `200` when adding to existing order.

---

### PATCH `/item/:itemId`
Update the quantity of a specific item in an open order.

**Body:**
```json
{ "quantity": 3 }
```

- Validates stock availability if quantity increases.
- Restores stock if quantity decreases.
- Recalculates `totalPrice` and `finalPrice` automatically.
- Returns `409` if the order is `COMPLETED`.

---

### DELETE `/item/:itemId`
Remove an item from an open order.

- Restores stock for that item.
- Recalculates `totalPrice` and `finalPrice`.
- Returns `409` if the order is `COMPLETED`.

---

### PATCH `/visit/:visitId/complete`
Mark the visit's order as `COMPLETED`.

- Only works for visit orders.
- Returns `409` if already completed.

---

### PATCH `/:orderId/complete`
Mark a takeaway order as `COMPLETED`.

- Only works for orders with `visitId: null` (takeaway).
- Returns `400` if called on a visit order (use the visit endpoint instead).
- Returns `409` if already completed.

---

### DELETE `/:orderId`
Cancel an order and delete it.

- Restores all item stock back to products.
- Returns `204` on success.

---

### GET `/visit/:visitId`
Get the order for a specific visit.

---

### GET `/getById/:orderId`
Get a single order by its ID.

---

### GET `/:orderId/invoice`
Get full receipt data for an order — used for printing.

**Response includes everything in the order plus:**
```json
{
  "branch": {
    "id": "uuid",
    "name": "Branch Name",
    "address": "123 Main St"
  },
  "customer": {
    "id": "uuid",
    "name": "Ahmed Ali",
    "phone": "01012345678",
    "email": "ahmed@example.com"
  }
}
```

---

### GET `/getAll`
List all orders with pagination.

**Query params:**
| Param | Notes |
|-------|-------|
| `branchId` | Filter by branch |
| `visitId` | Filter by visit |
| `page` | Default 1 |
| `limit` | Default 10 |
| `sort` | Default `createdAt` |
| `order` | `asc` or `desc` |

---

### GET `/analytics/branch/:branchId`
Top products and total order count for a branch.

**Query params:**
| Param | Notes |
|-------|-------|
| `startDate` | e.g. `2026-01-01` |
| `endDate` | e.g. `2026-05-20` |

**Response:**
```json
{
  "totalOrders": 142,
  "topProducts": [
    {
      "productId": "uuid",
      "productName": "Cola",
      "totalQuantity": 80,
      "totalRevenue": 2000.00
    }
  ]
}
```

---

## Business Logic

### Order Number (`number`)
Each order gets a sequential number **scoped per branch** — not global.
- Branch A: Order #1, #2, #3 ...
- Branch B: Order #1, #2, #3 ... (independent)

Used for human-readable invoice references.

---

### Discount System

An order has **two independent discounts** that both apply:

| Field | Source | Applied |
|-------|--------|---------|
| `discount.customer` | Auto-resolved from customer's profile at order creation | Always |
| `discount.order` | Manually passed in the request body by staff | When provided |

**Calculation order — customer discount first, then order discount:**
```
totalPrice = sum of all item prices
step 1 → apply customer discount to totalPrice
step 2 → apply order discount to result of step 1
finalPrice = result of step 2
```

**Example:**
- Items total: `100 EGP`
- Customer has `10% PERCENT` discount (VIP)
- Staff adds `15% PERCENT` order discount
- Step 1: `100 - 10% = 90 EGP`
- Step 2: `90 - 15% = 76.50 EGP`
- `finalPrice = 76.50 EGP`

**If no customer discount:** only the order discount applies.
**If no order discount:** only the customer discount applies.
**If neither:** `finalPrice = totalPrice`.

**Customer discount is active only when:**
1. Customer has `hasDiscount: true`
2. `discountAmount > 0`
3. Current date is within `discountStartsAt` → `discountEndsAt` (if set)
4. Current time is within `discountStartTime` → `discountEndTime` (if set)

**Discounts are snapshotted at order creation** — if a customer's discount expires after the order is created, the `finalPrice` is not retroactively changed. It only re-evaluates when items are added, updated, or removed.

---

### Stock Management

Stock is automatically managed:

| Action | Stock effect |
|--------|-------------|
| Add items to order | Decremented immediately |
| Increase item quantity | Decremented by the difference |
| Decrease item quantity | Restored by the difference |
| Remove item | Fully restored |
| Cancel order | All items fully restored |

If a product has insufficient stock, the request is rejected with `400`.
If a product is inactive, the request is rejected with `400`.

---

### Blocked Customer
If the customer attached to an order is blocked, order creation throws `403`. Their discount is also ignored.

---

### Completed Order Guard
Once an order is `COMPLETED`, no modifications are allowed:
- Adding items → `409`
- Updating item quantity → `409`
- Removing items → `409`

Reading and invoicing are still allowed on completed orders.

---

### Visit Order Flow
```
Visit ACTIVE
  → POST /orders/create (with visitId) → Order OPEN
  → Add/update/remove items as needed
  → PATCH /orders/visit/:visitId/complete → Order COMPLETED
  → POST /invoices/create/:visitId → Invoice UNPAID
  → PATCH /invoices/pay/:visitId → Invoice PAID, Visit PAID
```

### Takeaway Order Flow
```
POST /orders/create (with branchId, no visitId) → Order OPEN
  → Add/update/remove items as needed
  → PATCH /orders/:orderId/complete → Order COMPLETED
  → POST /invoices/createOrder/:orderId → Invoice UNPAID
  → PATCH /invoices/payById/:invoiceId → Invoice PAID
```
