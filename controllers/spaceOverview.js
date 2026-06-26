import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

// Controller: GET /overview/:branchId
// Returns all spaces (no pagination). For PUBLIC spaces, includes devices and units.
// Also returns metrics: activeVisits, spacesOccupied, todayOrders, longestSessionSeconds
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
        session: { status: "ACTIVE", deletedAt: null },
      },
      select: {
        resourceType: true,
        resourceId: true,
        session: {
          select: {
            visit: {
              select: {
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
        OR: [
          { startedAt: { gte: startOfDay, lte: endOfDay } },
          { endedAt: { gte: startOfDay, lte: endOfDay } },
        ],
      },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  const occupiedSpaceIds = new Set(
    sessionComponentsActive
      .filter((c) => c.resourceType === "SPACE")
      .map((c) => c.resourceId),
  );

  const activeCustomerByResource = new Map();
  for (const component of sessionComponentsActive) {
    const customer = component.session?.visit?.customer || null;
    if (!customer) continue;
    const key = `${component.resourceType}:${component.resourceId}`;
    if (!activeCustomerByResource.has(key)) {
      activeCustomerByResource.set(key, customer);
    }
  }

  const emptyCustomer = { id: "", name: "" };
  const publicMap = new Map();
  for (const p of publicSpacesWithRelations) publicMap.set(p.id, p);

  const getActiveCustomer = (resourceType, resourceId) =>
    activeCustomerByResource.get(`${resourceType}:${resourceId}`) ||
    emptyCustomer;

  const assembledSpaces = spacesBasic.map((s) => {
    if (s.type === "PUBLIC" && publicMap.has(s.id)) {
      const pub = publicMap.get(s.id);
      return {
        ...s,
        devices: (pub.devices || []).map((device) => ({
          ...device,
          ...(device.isBusy
            ? { customer: getActiveCustomer("DEVICE", device.id) }
            : {}),
        })),
        units: (pub.units || []).map((unit) => ({
          ...unit,
          ...(unit.isBusy
            ? { customer: getActiveCustomer("UNIT", unit.id) }
            : {}),
        })),
      };
    }
    return {
      ...s,
      ...(s.isBusy ? { customer: getActiveCustomer("SPACE", s.id) } : {}),
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

  return {
    analytics: {
      activeVisits,
      spacesOccupied: occupiedSpaceIds.size,
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
