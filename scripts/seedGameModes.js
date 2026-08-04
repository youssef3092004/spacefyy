/**
 * Create default SGL/DBL game modes for branches that already exist.
 *
 * Existing installations never re-run `seed:full`, so this backfills the mode
 * catalogue for them. Idempotent — safe to run repeatedly.
 *
 * Each mode points at one specific CONTROLLER equipment row. When a branch has
 * several, the first active one by name is used; re-point it afterwards via
 * PATCH /api/v1/game-modes/update/:branchId/:gameModeId if that's the wrong one.
 *
 *   node --env-file=.env scripts/seedGameModes.js            # all branches
 *   node --env-file=.env scripts/seedGameModes.js <branchId> # one branch
 */
import process from "process";
import { prisma } from "../configs/db.js";

const MODES = [
  {
    code: "SGL",
    label: "Single (1v1)",
    players: 2,
    controllersRequired: 1,
    sortOrder: 1,
    isDefault: true,
  },
  {
    code: "DBL",
    label: "Double (2v2)",
    players: 4,
    controllersRequired: 2,
    sortOrder: 2,
    isDefault: false,
  },
];

const main = async () => {
  const only = process.argv[2];

  const branches = await prisma.branch.findMany({
    where: only ? { id: only } : {},
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (branches.length === 0) {
    console.log(only ? `No branch with id ${only}` : "No branches found");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    const controllers = await prisma.equipment.findMany({
      where: {
        branchId: branch.id,
        type: "CONTROLLER",
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (controllers.length === 0) {
      console.log(`  skip  ${branch.name} — no active CONTROLLER equipment`);
      skipped += 1;
      continue;
    }

    const controller = controllers[0];
    if (controllers.length > 1) {
      console.log(
        `  note  ${branch.name} has ${controllers.length} controller rows — using "${controller.name}"`,
      );
    }

    for (const mode of MODES) {
      const existing = await prisma.gameMode.findUnique({
        where: { branchId_code: { branchId: branch.id, code: mode.code } },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.gameMode.create({
        data: {
          branchId: branch.id,
          ...mode,
          controllerEquipmentId: controller.id,
          isActive: true,
        },
      });
      created += 1;
    }

    console.log(`  ok    ${branch.name} → SGL/DBL on "${controller.name}"`);
  }

  console.log(`\ncreated ${created}, already present ${skipped}`);
};

main()
  .catch((error) => {
    console.error("seedGameModes failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
