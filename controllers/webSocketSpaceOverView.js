import jwt from "jsonwebtoken";
import process from "process";
import { prisma } from "../configs/db.js";
import { checkBranchAccess } from "../utils/checkBranchAccess.js";

let socketServer = null;

export const SPACE_OVERVIEW_EVENT = "space-overview:updated";
export const SPACE_OVERVIEW_JOIN_EVENT = "space-overview:join";
export const SPACE_OVERVIEW_LEAVE_EVENT = "space-overview:leave";
export const SPACE_OVERVIEW_ERROR_EVENT = "space-overview:error";

export const getSpaceOverviewRoom = (branchId) =>
  `space-overview:branch:${branchId}`;

// Mirrors verifyToken: a valid, non-blacklisted JWT for a live user. Rejecting
// at the handshake means an anonymous client can never reach a branch room.
const authenticateSocket = async (socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization ||
      "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;

    if (!token) return next(new Error("Authentication required"));

    const blacklisted = await prisma.blacklistedToken.findUnique({
      where: { token },
      select: { id: true },
    });
    if (blacklisted) return next(new Error("Token is expired"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    if (!userId) return next(new Error("Invalid token"));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isDeleted: true, role: { select: { name: true } } },
    });
    if (!user || user.isDeleted) return next(new Error("Account is not active"));

    socket.data.user = { id: user.id, roleName: user.role?.name ?? null };
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
};

export const initializeWebSocketSpaceOverView = (io) => {
  socketServer = io;

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.on(SPACE_OVERVIEW_JOIN_EVENT, async ({ branchId } = {}) => {
      if (!branchId) return;

      const { id, roleName } = socket.data.user ?? {};
      const hasAccess = await checkBranchAccess(id, roleName, branchId);
      if (!hasAccess) {
        socket.emit(SPACE_OVERVIEW_ERROR_EVENT, {
          branchId,
          message: "You do not have access to this branch",
        });
        return;
      }

      socket.join(getSpaceOverviewRoom(branchId));
    });

    socket.on(SPACE_OVERVIEW_LEAVE_EVENT, ({ branchId } = {}) => {
      if (!branchId) return;
      socket.leave(getSpaceOverviewRoom(branchId));
    });
  });
};

export const emitSpaceOverviewUpdate = (branchId, payload = {}) => {
  if (!socketServer || !branchId) return false;

  socketServer.to(getSpaceOverviewRoom(branchId)).emit(SPACE_OVERVIEW_EVENT, {
    branchId,
    refreshedAt: new Date().toISOString(),
    ...payload,
  });

  return true;
};

export const getWebSocketSpaceOverViewStatus = (req, res) => {
  const { branchId } = req.params;

  res.status(200).json({
    status: "success",
    data: {
      event: SPACE_OVERVIEW_EVENT,
      joinEvent: SPACE_OVERVIEW_JOIN_EVENT,
      leaveEvent: SPACE_OVERVIEW_LEAVE_EVENT,
      room: getSpaceOverviewRoom(branchId),
      connected: Boolean(socketServer),
    },
  });
};

export default initializeWebSocketSpaceOverView;
