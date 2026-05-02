[
  {
    "id": "bbccdde0-1122-4a33-bb44-556677889900",
    "role": "ADMIN",
    "permissions": ["manage_users", "manage_products", "view_reports"]
  },
  {
    "id": "ccddee11-2233-4b44-cc55-667788990011",
    "role": "STAFF",
    "permissions": ["manage_products", "view_reports"]
  }
]
import { prisma } from "../configs/db.js";
import { PERMISSIONS, ROLES } from "./permissions.js";

const upsertRoles = async (db) => {
  for (const role of ROLES) {
    await db.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: {
        name: role.name,
        description: role.description,
      },
    });
  }
};

const upsertPermissions = async (db) => {
  await db.permission.createMany({
    data: PERMISSIONS,
    skipDuplicates: true,
  });
};

const assignAllPermissionsToAllRoles = async (db) => {
  const roles = await db.role.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  const permissions = await db.permission.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  if (!roles.length) {
    throw new Error("No roles found after RBAC seed");
  }

  if (!permissions.length) {
    throw new Error("No permissions found after RBAC seed");
  }

  for (const role of roles) {
    const rolePermissionsData = permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    }));

    const result = await db.rolePermission.createMany({
      data: rolePermissionsData,
      skipDuplicates: true,
    });

    console.log(`Assigned ${result.count} permissions to role ${role.name}`);
  }
};

const main = async () => {
  await prisma.$transaction(async (tx) => {
    await upsertRoles(tx);
    await upsertPermissions(tx);
    await assignAllPermissionsToAllRoles(tx);
  });

  console.log("RBAC seed completed successfully.");
};

main()
  .catch((error) => {
    console.error("RBAC seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
