import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

// Controller: GET /overview/:branchId
// Returns all spaces (no pagination). For PUBLIC spaces, includes devices and units.
// Also returns metrics: activeVisits, spacesOccupied, spacesTotal, todayOrders, longestSessionSeconds
export const buildSpacesOverviewData = async (branchId) => {
  if (!branchId) throw new AppError("Branch ID is required", 400);

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });
  if (!branch) throw new AppError("Branch not found", 404);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [
    spacesBasic,
    publicSpacesWithRelations,
    activeVisits,
    todayOrders,
    sessionComponentsActive,
    sessionsToday,
  ] = await prisma.$transaction([
    prisma.space.findMany({
      where: { branchId, deletedAt: null, isDeleted: false },
      select: {
        id: true,
        name: true,
        type: true,
        customTypeLabel: true,
        image: true,
        capacity: true,
        availableNumber: true,
        priceType: true,
        price: true,
        isActive: true,
        isBusy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.space.findMany({
      where: { branchId, type: "PUBLIC", deletedAt: null, isDeleted: false },
      include: {
        devices: {
          where: { deletedAt: null, isDeleted: false },
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
            isBusy: true,
          },
        },
        units: {
          where: { isDeleted: false },
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
            isBusy: true,
          },
        },
      },
    }),
    prisma.visit.count({ where: { branchId, status: "ACTIVE" } }),
    prisma.order.count({
      where: { branchId, createdAt: { gte: startOfDay, lte: endOfDay } },
    }),
    prisma.sessionComponent.findMany({
      where: {
        branchId,
        endedAt: null,
        session: { status: "ACTIVE", deletedAt: null },
      },
      select: {
        resourceType: true,
        resourceId: true,
        session: {
          select: {
            visit: {
              select: {
                id: true,
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.session.findMany({
      where: {
        branchId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        OR: [
          { startedAt: { gte: startOfDay, lte: endOfDay } },
          { endedAt: { gte: startOfDay, lte: endOfDay } },
        ],
      },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  const activeCustomerByResource = new Map();
  const activeVisitByResource = new Map();
  for (const component of sessionComponentsActive) {
    const visit = component.session?.visit;
    if (!visit) continue;
    const key = `${component.resourceType}:${component.resourceId}`;
    if (visit.customer && !activeCustomerByResource.has(key)) {
      activeCustomerByResource.set(key, visit.customer);
    }
    if (!activeVisitByResource.has(key)) {
      activeVisitByResource.set(key, visit.id);
    }
  }

  const emptyCustomer = { id: "", name: "" };
  const publicMap = new Map();
  for (const p of publicSpacesWithRelations) publicMap.set(p.id, p);

  const getActiveCustomer = (resourceType, resourceId) =>
    activeCustomerByResource.get(`${resourceType}:${resourceId}`) ||
    emptyCustomer;

  const getActiveVisitId = (resourceType, resourceId) =>
    activeVisitByResource.get(`${resourceType}:${resourceId}`) || null;

  const assembledSpaces = spacesBasic.map((s) => {
    if (s.type === "PUBLIC" && publicMap.has(s.id)) {
      const pub = publicMap.get(s.id);
      return {
        ...s,
        devices: (pub.devices || []).map((device) => ({
          ...device,
          ...(device.isBusy
            ? {
                customer: getActiveCustomer("DEVICE", device.id),
                visitId: getActiveVisitId("DEVICE", device.id),
              }
            : {}),
        })),
        units: (pub.units || []).map((unit) => ({
          ...unit,
          ...(unit.isBusy
            ? {
                customer: getActiveCustomer("UNIT", unit.id),
                visitId: getActiveVisitId("UNIT", unit.id),
              }
            : {}),
        })),
      };
    }
    return {
      ...s,
      ...(s.isBusy
        ? {
            customer: getActiveCustomer("SPACE", s.id),
            visitId: getActiveVisitId("SPACE", s.id),
          }
        : {}),
    };
  });

  let longestSessionSeconds = 0;
  const nowTs = Date.now();
  for (const sess of sessionsToday) {
    const startTs = new Date(sess.startedAt).getTime();
    const endTs = sess.endedAt ? new Date(sess.endedAt).getTime() : nowTs;
    const duration = Math.max(0, Math.floor((endTs - startTs) / 1000));
    if (duration > longestSessionSeconds) longestSessionSeconds = duration;
  }

  // ── Capacity metrics (occupied / total) ────────────────────────────
  // A non-PUBLIC space is itself one bookable unit (tracked by space.isBusy).
  // A PUBLIC space contributes its inner devices + units as the bookable
  // units, and each one is counted (and marked occupied) by its own isBusy.
  let spacesTotal = 0;
  let spacesOccupied = 0;
  for (const s of assembledSpaces) {
    if (s.type === "PUBLIC") {
      const devices = s.devices ?? [];
      const units = s.units ?? [];
      spacesTotal += devices.length + units.length;
      spacesOccupied +=
        devices.filter((d) => d.isBusy).length +
        units.filter((u) => u.isBusy).length;
    } else {
      spacesTotal += 1;
      if (s.isBusy) spacesOccupied += 1;
    }
  }

  return {
    analytics: {
      activeVisits,
      spacesOccupied,
      spacesTotal,
      todayOrders,
      longestSessionSeconds,
    },
    spaces: assembledSpaces,
  };
};

export const getSpacesOverview = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const data = await buildSpacesOverviewData(branchId);
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

export default getSpacesOverview;
