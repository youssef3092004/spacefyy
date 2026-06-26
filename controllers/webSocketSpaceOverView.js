let socketServer = null;

export const SPACE_OVERVIEW_EVENT = "space-overview:updated";
export const SPACE_OVERVIEW_JOIN_EVENT = "space-overview:join";
export const SPACE_OVERVIEW_LEAVE_EVENT = "space-overview:leave";

export const getSpaceOverviewRoom = (branchId) =>
  `space-overview:branch:${branchId}`;

export const initializeWebSocketSpaceOverView = (io) => {
  socketServer = io;

  io.on("connection", (socket) => {
    socket.on(SPACE_OVERVIEW_JOIN_EVENT, ({ branchId } = {}) => {
      if (!branchId) return;
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
