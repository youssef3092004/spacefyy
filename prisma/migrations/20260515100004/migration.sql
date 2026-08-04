-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER', 'OWNER', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'INSTAPAY', 'CARD');

-- CreateEnum
CREATE TYPE "ApprovalSource" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'AR');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('PRIVATE', 'PUBLIC', 'DESK', 'MEETING', 'VIP', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('PC', 'LAPTOP', 'PS4_2', 'PS4_4', 'PS5_2', 'PS5_4', 'XBOX_ONE', 'XBOX_SERIES_S', 'XBOX_SERIES_X', 'NINTENDO_SWITCH', 'VR_HEADSET', 'SIMULATOR', 'TV', 'PROJECTOR', 'TABLET', 'SMART_BOARD', 'SOUND_SYSTEM', 'CAMERA', 'MICROPHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('TABLE_TENNIS_TABLE', 'BILLIARD_TABLE', 'GAMING_STATION', 'MULTI_PURPOSE_TABLE', 'DESK', 'SEAT', 'SIMULATOR_POD', 'VR_POD', 'MEETING_SEAT', 'LOCKER', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('CONTROLLER', 'HEADSET', 'KEYBOARD', 'MOUSE', 'STEERING_WHEEL', 'JOYSTICK', 'FLIGHT_STICK', 'PEDALS', 'MICROPHONE', 'WEBCAM', 'PING_PONG', 'BILLIARDO', 'BOARD_GAME', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('PER_HOUR', 'PER_SESSION', 'PER_GAME');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('TIME_RANGE', 'PER_HOUR', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'CLOSED', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "SessionResourceType" AS ENUM ('SPACE', 'DEVICE', 'UNIT', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "defaultLanguage" "Language" NOT NULL DEFAULT 'EN',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApprovePayroll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "roleId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "profileImage" TEXT DEFAULT 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NationalId" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "frontImage" TEXT NOT NULL,
    "backImage" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,

    CONSTRAINT "NationalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchUserPermission" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchUserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "grossSalary" DECIMAL(12,2) NOT NULL,
    "bonus" DECIMAL(12,2) NOT NULL,
    "overtime" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(65,30) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PENDING',
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "UserRole" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT 'https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openingTime" TIMESTAMP(3),
    "closingTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchMonthlyStats" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "avgSpendPerCustomer" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchMonthlyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistedToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlacklistedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SpaceType" NOT NULL,
    "customTypeLabel" TEXT,
    "image" TEXT NOT NULL DEFAULT 'https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=',
    "capacity" INTEGER NOT NULL,
    "availableNumber" INTEGER NOT NULL DEFAULT 1,
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBusy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "spaceId" TEXT,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "customTypeLabel" TEXT,
    "image" TEXT NOT NULL DEFAULT 'https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=',
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBusy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "spaceId" TEXT,
    "name" TEXT NOT NULL,
    "type" "UnitType" NOT NULL,
    "customTypeLabel" TEXT,
    "image" TEXT NOT NULL DEFAULT 'https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=',
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBusy" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "customTypeLabel" TEXT,
    "image" TEXT NOT NULL DEFAULT 'https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=',
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBusy" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "minDurationMinutes" INTEGER,
    "maxDurationMinutes" INTEGER,
    "minPlayers" INTEGER,
    "maxPlayers" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'TIME_RANGE',
    "spaceId" TEXT,
    "deviceId" TEXT,
    "unitId" TEXT,
    "equipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "trialDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "maxStaff" INTEGER,
    "maxBranches" INTEGER,
    "maxSpaces" INTEGER,
    "maxDevices" INTEGER,
    "maxUnits" INTEGER,
    "maxEquipment" INTEGER,
    "maxUsers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUsage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "currentBranches" INTEGER NOT NULL DEFAULT 0,
    "currentSpaces" INTEGER NOT NULL DEFAULT 0,
    "currentDevices" INTEGER NOT NULL DEFAULT 0,
    "currentUnits" INTEGER NOT NULL DEFAULT 0,
    "currentEquipment" INTEGER NOT NULL DEFAULT 0,
    "currentStaff" INTEGER NOT NULL DEFAULT 0,
    "currentUsers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUsageHistory" (
    "id" TEXT NOT NULL,
    "storageUsageId" TEXT NOT NULL,
    "branches" INTEGER NOT NULL,
    "spaces" INTEGER NOT NULL,
    "devices" INTEGER NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "equipment" INTEGER NOT NULL DEFAULT 0,
    "staff" INTEGER NOT NULL,
    "users" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageUsageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "seqNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "birthday" TIMESTAMP(3),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "hasDiscount" BOOLEAN NOT NULL DEFAULT false,
    "discountType" TEXT NOT NULL DEFAULT 'FLAT',
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountStartsAt" TIMESTAMP(3),
    "discountEndsAt" TIMESTAMP(3),
    "discountStartTime" TEXT,
    "discountEndTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBranch" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstVisitAt" TIMESTAMP(3),

    CONSTRAINT "CustomerBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pricingRuleId" TEXT,
    "pricingMode" "PricingMode",
    "totalPrice" DECIMAL(10,2),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "bookingId" TEXT,
    "resourceType" "SessionResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "pricingRuleId" TEXT,
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gamesCount" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "endedById" TEXT,
    "canceledById" TEXT,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "visitId" TEXT,
    "branchId" TEXT,
    "customerId" TEXT,
    "number" INTEGER NOT NULL DEFAULT 1,
    "discountType" TEXT NOT NULL DEFAULT 'FLAT',
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "customerDiscountType" TEXT NOT NULL DEFAULT 'FLAT',
    "customerDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_businessId_key" ON "BusinessSettings"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffProfile_branchId_idx" ON "StaffProfile"("branchId");

-- CreateIndex
CREATE INDEX "StaffProfile_branchId_createdAt_idx" ON "StaffProfile"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffProfile_position_idx" ON "StaffProfile"("position");

-- CreateIndex
CREATE INDEX "StaffProfile_department_idx" ON "StaffProfile"("department");

-- CreateIndex
CREATE UNIQUE INDEX "NationalId_number_key" ON "NationalId"("number");

-- CreateIndex
CREATE UNIQUE INDEX "NationalId_staffProfileId_key" ON "NationalId"("staffProfileId");

-- CreateIndex
CREATE INDEX "NationalId_number_idx" ON "NationalId"("number");

-- CreateIndex
CREATE INDEX "NationalId_staffProfileId_idx" ON "NationalId"("staffProfileId");

-- CreateIndex
CREATE INDEX "BranchUserPermission_isAllowed_idx" ON "BranchUserPermission"("isAllowed");

-- CreateIndex
CREATE INDEX "BranchUserPermission_branchId_idx" ON "BranchUserPermission"("branchId");

-- CreateIndex
CREATE INDEX "BranchUserPermission_userId_idx" ON "BranchUserPermission"("userId");

-- CreateIndex
CREATE INDEX "BranchUserPermission_userId_branchId_idx" ON "BranchUserPermission"("userId", "branchId");

-- CreateIndex
CREATE INDEX "BranchUserPermission_permissionId_idx" ON "BranchUserPermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchUserPermission_branchId_userId_permissionId_key" ON "BranchUserPermission"("branchId", "userId", "permissionId");

-- CreateIndex
CREATE INDEX "Payroll_status_idx" ON "Payroll"("status");

-- CreateIndex
CREATE INDEX "Payroll_month_year_idx" ON "Payroll"("month", "year");

-- CreateIndex
CREATE INDEX "Payroll_approvedById_idx" ON "Payroll"("approvedById");

-- CreateIndex
CREATE INDEX "Payroll_staffProfileId_idx" ON "Payroll"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_staffProfileId_month_year_key" ON "Payroll"("staffProfileId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_permissionId_idx" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserPermission_isAllowed_idx" ON "UserPermission"("isAllowed");

-- CreateIndex
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");

-- CreateIndex
CREATE INDEX "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE INDEX "Branch_businessId_idx" ON "Branch"("businessId");

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateIndex
CREATE INDEX "Branch_createdAt_idx" ON "Branch"("createdAt");

-- CreateIndex
CREATE INDEX "BranchMonthlyStats_branchId_idx" ON "BranchMonthlyStats"("branchId");

-- CreateIndex
CREATE INDEX "BranchMonthlyStats_branchId_year_month_idx" ON "BranchMonthlyStats"("branchId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMonthlyStats_branchId_month_year_key" ON "BranchMonthlyStats"("branchId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BlacklistedToken_token_key" ON "BlacklistedToken"("token");

-- CreateIndex
CREATE INDEX "Space_branchId_idx" ON "Space"("branchId");

-- CreateIndex
CREATE INDEX "Space_branchId_isBusy_isActive_idx" ON "Space"("branchId", "isBusy", "isActive");

-- CreateIndex
CREATE INDEX "Space_deletedAt_idx" ON "Space"("deletedAt");

-- CreateIndex
CREATE INDEX "Space_branchId_deletedAt_idx" ON "Space"("branchId", "deletedAt");

-- CreateIndex
CREATE INDEX "Space_isDeleted_idx" ON "Space"("isDeleted");

-- CreateIndex
CREATE INDEX "Space_branchId_isDeleted_idx" ON "Space"("branchId", "isDeleted");

-- CreateIndex
CREATE INDEX "Device_branchId_idx" ON "Device"("branchId");

-- CreateIndex
CREATE INDEX "Device_spaceId_idx" ON "Device"("spaceId");

-- CreateIndex
CREATE INDEX "Device_branchId_type_idx" ON "Device"("branchId", "type");

-- CreateIndex
CREATE INDEX "Device_branchId_isBusy_isActive_idx" ON "Device"("branchId", "isBusy", "isActive");

-- CreateIndex
CREATE INDEX "Device_deletedAt_idx" ON "Device"("deletedAt");

-- CreateIndex
CREATE INDEX "Device_isDeleted_idx" ON "Device"("isDeleted");

-- CreateIndex
CREATE INDEX "Device_branchId_isDeleted_idx" ON "Device"("branchId", "isDeleted");

-- CreateIndex
CREATE INDEX "Device_branchId_isDeleted_deletedAt_idx" ON "Device"("branchId", "isDeleted", "deletedAt");

-- CreateIndex
CREATE INDEX "Unit_branchId_idx" ON "Unit"("branchId");

-- CreateIndex
CREATE INDEX "Unit_spaceId_idx" ON "Unit"("spaceId");

-- CreateIndex
CREATE INDEX "Unit_isDeleted_idx" ON "Unit"("isDeleted");

-- CreateIndex
CREATE INDEX "Unit_deletedAt_idx" ON "Unit"("deletedAt");

-- CreateIndex
CREATE INDEX "Unit_branchId_isActive_isDeleted_idx" ON "Unit"("branchId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "Unit_branchId_isBusy_isActive_isDeleted_idx" ON "Unit"("branchId", "isBusy", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "Unit_branchId_type_isDeleted_idx" ON "Unit"("branchId", "type", "isDeleted");

-- CreateIndex
CREATE INDEX "Equipment_branchId_idx" ON "Equipment"("branchId");

-- CreateIndex
CREATE INDEX "Equipment_isDeleted_idx" ON "Equipment"("isDeleted");

-- CreateIndex
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");

-- CreateIndex
CREATE INDEX "Equipment_branchId_isActive_isDeleted_idx" ON "Equipment"("branchId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "Equipment_branchId_isBusy_isActive_isDeleted_idx" ON "Equipment"("branchId", "isBusy", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "Equipment_branchId_type_isDeleted_idx" ON "Equipment"("branchId", "type", "isDeleted");

-- CreateIndex
CREATE INDEX "PricingRule_spaceId_idx" ON "PricingRule"("spaceId");

-- CreateIndex
CREATE INDEX "PricingRule_deviceId_idx" ON "PricingRule"("deviceId");

-- CreateIndex
CREATE INDEX "PricingRule_unitId_idx" ON "PricingRule"("unitId");

-- CreateIndex
CREATE INDEX "PricingRule_equipmentId_idx" ON "PricingRule"("equipmentId");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_idx" ON "PricingRule"("isActive");

-- CreateIndex
CREATE INDEX "PricingRule_pricingType_idx" ON "PricingRule"("pricingType");

-- CreateIndex
CREATE INDEX "PricingRule_pricingMode_idx" ON "PricingRule"("pricingMode");

-- CreateIndex
CREATE INDEX "PricingRule_priority_idx" ON "PricingRule"("priority");

-- CreateIndex
CREATE INDEX "PricingRule_spaceId_pricingMode_idx" ON "PricingRule"("spaceId", "pricingMode");

-- CreateIndex
CREATE INDEX "PricingRule_deviceId_pricingMode_idx" ON "PricingRule"("deviceId", "pricingMode");

-- CreateIndex
CREATE INDEX "PricingRule_unitId_pricingMode_idx" ON "PricingRule"("unitId", "pricingMode");

-- CreateIndex
CREATE INDEX "PricingRule_equipmentId_pricingMode_idx" ON "PricingRule"("equipmentId", "pricingMode");

-- CreateIndex
CREATE INDEX "PricingRule_spaceId_isActive_idx" ON "PricingRule"("spaceId", "isActive");

-- CreateIndex
CREATE INDEX "PricingRule_deviceId_isActive_idx" ON "PricingRule"("deviceId", "isActive");

-- CreateIndex
CREATE INDEX "PricingRule_unitId_isActive_idx" ON "PricingRule"("unitId", "isActive");

-- CreateIndex
CREATE INDEX "PricingRule_equipmentId_isActive_idx" ON "PricingRule"("equipmentId", "isActive");

-- CreateIndex
CREATE INDEX "PricingRule_spaceId_isActive_priority_idx" ON "PricingRule"("spaceId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "PricingRule_deviceId_isActive_priority_idx" ON "PricingRule"("deviceId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "PricingRule_unitId_isActive_priority_idx" ON "PricingRule"("unitId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "PricingRule_equipmentId_isActive_priority_idx" ON "PricingRule"("equipmentId", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE INDEX "Plan_isActive_idx" ON "Plan"("isActive");

-- CreateIndex
CREATE INDEX "Plan_billingInterval_idx" ON "Plan"("billingInterval");

-- CreateIndex
CREATE UNIQUE INDEX "StorageUsage_businessId_key" ON "StorageUsage"("businessId");

-- CreateIndex
CREATE INDEX "StorageUsage_businessId_idx" ON "StorageUsage"("businessId");

-- CreateIndex
CREATE INDEX "StorageUsageHistory_storageUsageId_idx" ON "StorageUsageHistory"("storageUsageId");

-- CreateIndex
CREATE INDEX "StorageUsageHistory_recordedAt_idx" ON "StorageUsageHistory"("recordedAt");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_isBlocked_idx" ON "Customer"("isBlocked");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_seqNumber_key" ON "Customer"("businessId", "seqNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phone_key" ON "Customer"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_email_key" ON "Customer"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_email_phone_key" ON "Customer"("businessId", "email", "phone");

-- CreateIndex
CREATE INDEX "CustomerBranch_branchId_idx" ON "CustomerBranch"("branchId");

-- CreateIndex
CREATE INDEX "CustomerBranch_customerId_idx" ON "CustomerBranch"("customerId");

-- CreateIndex
CREATE INDEX "CustomerBranch_branchId_registeredAt_idx" ON "CustomerBranch"("branchId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBranch_customerId_branchId_key" ON "CustomerBranch"("customerId", "branchId");

-- CreateIndex
CREATE INDEX "Visit_branchId_idx" ON "Visit"("branchId");

-- CreateIndex
CREATE INDEX "Visit_customerId_idx" ON "Visit"("customerId");

-- CreateIndex
CREATE INDEX "Visit_pricingRuleId_idx" ON "Visit"("pricingRuleId");

-- CreateIndex
CREATE INDEX "Visit_branchId_status_idx" ON "Visit"("branchId", "status");

-- CreateIndex
CREATE INDEX "Visit_branchId_customerId_startedAt_idx" ON "Visit"("branchId", "customerId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_visitId_key" ON "Invoice"("visitId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Session_branchId_idx" ON "Session"("branchId");

-- CreateIndex
CREATE INDEX "Session_visitId_idx" ON "Session"("visitId");

-- CreateIndex
CREATE INDEX "Session_resourceId_idx" ON "Session"("resourceId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_pricingRuleId_idx" ON "Session"("pricingRuleId");

-- CreateIndex
CREATE INDEX "Session_bookingId_idx" ON "Session"("bookingId");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "Session_createdById_idx" ON "Session"("createdById");

-- CreateIndex
CREATE INDEX "Session_endedById_idx" ON "Session"("endedById");

-- CreateIndex
CREATE INDEX "Session_canceledById_idx" ON "Session"("canceledById");

-- CreateIndex
CREATE INDEX "Session_deletedById_idx" ON "Session"("deletedById");

-- CreateIndex
CREATE INDEX "Session_deletedAt_idx" ON "Session"("deletedAt");

-- CreateIndex
CREATE INDEX "Session_resourceType_resourceId_idx" ON "Session"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "Session_branchId_status_idx" ON "Session"("branchId", "status");

-- CreateIndex
CREATE INDEX "Session_branchId_status_deletedAt_idx" ON "Session"("branchId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Session_visitId_branchId_deletedAt_idx" ON "Session"("visitId", "branchId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryProduct_name_key" ON "CategoryProduct"("name");

-- CreateIndex
CREATE INDEX "CategoryProduct_createdAt_idx" ON "CategoryProduct"("createdAt");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_branchId_idx" ON "Product"("branchId");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_branchId_isActive_idx" ON "Product"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "Product_branchId_isActive_createdAt_idx" ON "Product"("branchId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Product_branchId_categoryId_idx" ON "Product"("branchId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_branchId_categoryId_isActive_idx" ON "Product"("branchId", "categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_branchId_key" ON "Product"("name", "branchId");

-- CreateIndex
CREATE INDEX "Order_visitId_idx" ON "Order"("visitId");

-- CreateIndex
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_visitId_createdAt_idx" ON "Order"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_createdAt_idx" ON "OrderItem"("createdAt");

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NationalId" ADD CONSTRAINT "NationalId_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchUserPermission" ADD CONSTRAINT "BranchUserPermission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchUserPermission" ADD CONSTRAINT "BranchUserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchUserPermission" ADD CONSTRAINT "BranchUserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMonthlyStats" ADD CONSTRAINT "BranchMonthlyStats_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageUsage" ADD CONSTRAINT "StorageUsage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageUsageHistory" ADD CONSTRAINT "StorageUsageHistory_storageUsageId_fkey" FOREIGN KEY ("storageUsageId") REFERENCES "StorageUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CategoryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
