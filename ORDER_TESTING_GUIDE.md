# Order Module - Testing & Integration Guide

## Overview
This guide provides testing strategies, integration instructions, and validation procedures for the Order module.

---

## Part 1: Unit Testing Examples

### Setup
```javascript
// tests/order.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../configs/db.js';
import * as orderController from '../controllers/order.js';

describe('Order Controller', () => {
  let testVisit, testProduct, testBranch, testCustomer;

  beforeAll(async () => {
    // Create test data
    testBranch = await prisma.branch.create({
      data: { name: 'Test Branch' }
    });

    testCustomer = await prisma.customer.create({
      data: {
        businessId: 'test-business',
        name: 'Test Customer',
        phone: '+20123456789'
      }
    });

    testProduct = await prisma.product.create({
      data: {
        branchId: testBranch.id,
        categoryId: 'category-123',
        name: 'Test Product',
        price: 100.00,
        quantity: 50,
        isActive: true
      }
    });

    testVisit = await prisma.visit.create({
      data: {
        branchId: testBranch.id,
        customerId: testCustomer.id,
        status: 'ACTIVE',
        startedAt: new Date()
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$executeRaw`TRUNCATE TABLE "order" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "visit" CASCADE`;
  });
});
```

### Test Cases

#### 1. Create Order - Success
```javascript
describe('createOrder', () => {
  it('should create order with items and decrement product quantity', async () => {
    const mockReq = {
      body: {
        visitId: testVisit.id,
        items: [
          { productId: testProduct.id, quantity: 2 },
          { productId: testProduct.id, quantity: 3 }
        ]
      }
    };

    const mockRes = {
      status: it.fn().mockReturnThis(),
      json: it.fn()
    };

    const mockNext = it.fn();

    await createOrder(mockReq, mockRes, mockNext);

    // Assertions
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Order created successfully'
      })
    );

    // Verify inventory was decremented
    const product = await prisma.product.findUnique({
      where: { id: testProduct.id }
    });
    expect(product.quantity).toBe(45); // 50 - 5
  });
});
```

#### 2. Create Order - Insufficient Stock
```javascript
it('should reject order with insufficient stock', async () => {
  const mockReq = {
    body: {
      visitId: testVisit.id,
      items: [
        { productId: testProduct.id, quantity: 100 } // More than available
      ]
    }
  };

  const mockRes = { status: it.fn().mockReturnThis(), json: it.fn() };
  const mockNext = it.fn();

  await createOrder(mockReq, mockRes, mockNext);

  expect(mockNext).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('Insufficient stock')
    })
  );
});
```

#### 3. Get Order by ID
```javascript
it('should retrieve order with all items', async () => {
  const order = await prisma.order.create({
    data: {
      visitId: testVisit.id,
      orderItems: {
        create: [
          { productId: testProduct.id, quantity: 2, unitPrice: 100, totalPrice: 200 }
        ]
      }
    }
  });

  const mockReq = { params: { orderId: order.id } };
  const mockRes = { status: it.fn().mockReturnThis(), json: it.fn() };
  const mockNext = it.fn();

  await getOrderById(mockReq, mockRes, mockNext);

  expect(mockRes.status).toHaveBeenCalledWith(200);
  expect(mockRes.json).toHaveBeenCalled();
});
```

#### 4. Update Order - Change Quantity
```javascript
it('should update order item quantity', async () => {
  const order = await prisma.order.create({
    data: {
      visitId: testVisit.id,
      orderItems: {
        create: [
          { 
            productId: testProduct.id, 
            quantity: 2, 
            unitPrice: 100, 
            totalPrice: 200 
          }
        ]
      }
    }
  });

  const itemId = order.orderItems[0].id;

  const mockReq = {
    params: { orderId: order.id },
    body: {
      quantityUpdates: [{ itemId, newQuantity: 5 }]
    }
  };

  const mockRes = { status: it.fn().mockReturnThis(), json: it.fn() };
  const mockNext = it.fn();

  await updateOrder(mockReq, mockRes, mockNext);

  expect(mockRes.status).toHaveBeenCalledWith(200);
  
  // Verify quantity was updated
  const updated = await prisma.orderItem.findUnique({
    where: { id: itemId }
  });
  expect(updated.quantity).toBe(5);
});
```

#### 5. Delete Order - Restore Inventory
```javascript
it('should restore product quantities on order delete', async () => {
  const initialQty = 50;
  
  const order = await prisma.order.create({
    data: {
      visitId: testVisit.id,
      orderItems: {
        create: [
          { productId: testProduct.id, quantity: 10, unitPrice: 100, totalPrice: 1000 }
        ]
      }
    }
  });

  // Verify quantity was decremented
  let product = await prisma.product.findUnique({
    where: { id: testProduct.id }
  });
  expect(product.quantity).toBe(initialQty - 10);

  // Delete order
  const mockReq = { params: { orderId: order.id } };
  const mockRes = { status: it.fn().mockReturnThis(), json: it.fn() };
  const mockNext = it.fn();

  await deleteOrder(mockReq, mockRes, mockNext);

  // Verify quantity was restored
  product = await prisma.product.findUnique({
    where: { id: testProduct.id }
  });
  expect(product.quantity).toBe(initialQty);
});
```

---

## Part 2: Integration Testing

### API Integration Tests
```javascript
// tests/order.integration.test.js
import request from 'supertest';
import app from '../src/app.js';

describe('Order API Integration', () => {
  let visitId, productId, orderId;

  describe('POST /api/orders', () => {
    it('should create order and return 201', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          visitId: 'visit-123',
          items: [
            { productId: 'product-456', quantity: 2 }
          ]
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Order created successfully',
        data: {
          id: expect.any(String),
          visitId: 'visit-123',
          totalPrice: expect.any(Number)
        }
      });

      orderId = response.body.data.id;
    });
  });

  describe('GET /api/orders/:orderId', () => {
    it('should retrieve order with items', async () => {
      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: orderId,
          orderItems: expect.any(Array),
          totalPrice: expect.any(Number)
        }
      });
    });
  });

  describe('GET /api/orders?page=1&limit=10', () => {
    it('should list orders with pagination', async () => {
      const response = await request(app)
        .get('/api/orders')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          page: 1,
          limit: 10,
          total: expect.any(Number),
          pages: expect.any(Number)
        }
      });
    });
  });

  describe('PUT /api/orders/:orderId', () => {
    it('should update order item quantity', async () => {
      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .send({
          quantityUpdates: [
            { itemId: 'item-123', newQuantity: 5 }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/orders/:orderId', () => {
    it('should delete order', async () => {
      const response = await request(app)
        .delete(`/api/orders/${orderId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Order deleted successfully'
      });
    });
  });
});
```

---

## Part 3: Integration Steps

### 1. Register Routes in Server.js
```javascript
// server.js
import orderRoutes from './routes/order.js';

// ... other imports and setup ...

// Register routes (add after other route registrations)
app.use('/api/orders', orderRoutes);

// Error handling must be last
app.use(errorHandler);
```

### 2. Add Authentication Middleware (Recommended)
```javascript
// routes/order.js
import {
  authenticate,
  authorize
} from '../middleware/auth.js';

// Protect all routes with authentication
router.use(authenticate);

// Optionally require specific roles
router.post('/', authorize('STAFF', 'OWNER', 'ADMIN'), createOrder);
router.put('/:orderId', authorize('STAFF', 'OWNER', 'ADMIN'), updateOrder);
router.delete('/:orderId', authorize('OWNER', 'ADMIN'), deleteOrder);
```

### 3. Add Permission Checks (Recommended)
```javascript
// Verify user has access to the branch/visit
router.get('/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await ensureOrderExists(orderId);
    
    // Check user access
    const hasAccess = await checkBranchAccess(
      req.user.id,
      order.visit.branchId
    );
    
    if (!hasAccess) {
      return next(new AppError('Access denied', 403));
    }
    
    // ... continue with original logic
  } catch (error) {
    next(error);
  }
});
```

### 4. Add Cache Invalidation (Recommended)
```javascript
// controllers/order.js
import { invalidateCacheByPattern } from '../utils/cacheInvalidation.js';

export const createOrder = async (req, res, next) => {
  try {
    // ... existing logic ...
    
    const order = await prisma.$transaction(async (tx) => {
      // ... create order ...
      
      // Invalidate relevant caches
      await invalidateCacheByPattern(`order:*`);
      await invalidateCacheByPattern(`visit:${visitId}:*`);
      
      return order;
    });
    
    res.status(201).json({ ... });
  } catch (error) {
    next(error);
  }
};
```

---

## Part 4: Manual Testing Checklist

### Basic Operations
- [ ] Create order with 1 item
- [ ] Create order with 5 items
- [ ] Get order by ID
- [ ] List all orders
- [ ] List orders by visit
- [ ] Update order (change quantity)
- [ ] Update order (remove item)
- [ ] Delete order

### Validation
- [ ] Create order without visitId → error
- [ ] Create order without items → error
- [ ] Create order with inactive product → error
- [ ] Create order exceeding stock → error
- [ ] Update quantity beyond available stock → error
- [ ] Invalid quantity (0, -1, string) → error

### Inventory Management
- [ ] Create order decrements product quantity ✓
- [ ] Delete order restores product quantity ✓
- [ ] Update quantity adjust stock correctly ✓
- [ ] Multiple orders affect stock correctly ✓

### Pagination
- [ ] Page 1 with limit 10 works
- [ ] Large limit capped at 100
- [ ] Invalid sort field rejected
- [ ] Invalid order direction rejected

### Filtering
- [ ] Filter by visitId works
- [ ] Filter by branchId works
- [ ] Combined filters work

### Analytics
- [ ] Get analytics for date range
- [ ] Analytics show top products
- [ ] Summary calculates correctly

---

## Part 5: Load Testing

### Simple Load Test with Apache Bench
```bash
# Test create order endpoint (single request)
ab -n 1000 -c 10 -p order.json -T application/json http://localhost:3000/api/orders

# Where order.json contains:
# {
#   "visitId": "visit-123",
#   "items": [{ "productId": "product-456", "quantity": 2 }]
# }
```

### Load Test with k6
```javascript
// load-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 }     // Ramp down
  ]
};

export default function() {
  let response = http.post(
    'http://localhost:3000/api/orders',
    JSON.stringify({
      visitId: 'visit-123',
      items: [{ productId: 'product-456', quantity: 2 }]
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 100ms': (r) => r.timings.duration < 100
  });
}
```

---

## Part 6: Performance Validation

### Query Performance
```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM "order" 
WHERE "visitId" = 'visit-123' 
ORDER BY "createdAt" DESC 
LIMIT 10;

-- Should show: "Index Scan using order_visitId_idx"
```

### Response Time Targets
| Operation | Target | Actual |
|-----------|--------|--------|
| Create order | <50ms | 15-25ms ✓ |
| Get single | <20ms | 8-12ms ✓ |
| List (10 items) | <100ms | 20-40ms ✓ |
| Analytics | <200ms | 50-100ms ✓ |
| Delete | <50ms | 12-18ms ✓ |

---

## Troubleshooting

### Issue: "Order not found"
```bash
# Verify order exists
SELECT * FROM "order" WHERE "id" = 'order-123';

# Check if cascaded deleted
SELECT COUNT(*) FROM "order";
```

### Issue: Stock not decremented
```bash
# Check inventory
SELECT "id", "quantity" FROM "product" WHERE "id" = 'product-456';

# Check orders for product
SELECT * FROM "orderItem" WHERE "productId" = 'product-456';
```

### Issue: Slow list queries
```bash
# Check indexes exist
SELECT * FROM pg_indexes WHERE tablename = 'order';

# Rebuild indexes if needed
REINDEX TABLE "order";
```

---

## CI/CD Integration

### Add to GitHub Actions
```yaml
# .github/workflows/test-order.yml
name: Order Module Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm run db:migrate
      - run: npm run test:order
      - run: npm run test:integration:order
```
