import { io } from "socket.io-client";
import process from "process";  

const API_URL =
  process.env.API_URL ||
  process.env.SOCKET_URL ||
  `http://127.0.0.1:${process.env.PORT || 3000}`;
const BRANCH_ID = process.env.BRANCH_ID;
const TOKEN = process.env.TOKEN;
const WAIT_MS = Number(process.env.WAIT_MS || 15000);

if (!BRANCH_ID) {
  console.error(
    "Missing BRANCH_ID. Example: BRANCH_ID=123 npm run test:space-overview-socket",
  );
  process.exit(1);
}

const statusUrl = `${API_URL}/api/v1/websocket-space-overview/status/${BRANCH_ID}`;
const fetchHeaders = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Checking status: ${statusUrl}`);

  try {
    const response = await fetch(statusUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    console.log("Status response:", JSON.stringify(payload, null, 2));
  } catch (error) {
    const errorDetails = [error?.name, error?.message]
      .filter(Boolean)
      .join(" - ");
    console.log(
      "Status request failed (socket test can still continue):",
      errorDetails || "unknown error",
    );
    console.log(
      "If this is connection refused, start the backend first with `npm run dev` and make sure PORT matches the API URL.",
    );
  }

  const socket = io(API_URL, {
    transports: ["websocket"],
    autoConnect: false,
    timeout: 5000,
    reconnection: false,
  });

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No update received within ${WAIT_MS}ms`));
    }, WAIT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("space-overview:updated", onUpdate);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };

    const onConnect = () => {
      console.log(`Socket connected: ${socket.id}`);
      socket.emit("space-overview:join", { branchId: BRANCH_ID });
      console.log(
        `Joined room for branch ${BRANCH_ID}, waiting for updates...`,
      );
    };

    const onConnectError = (error) => {
      console.error("Socket connect_error details:", {
        message: error?.message,
        description: error?.description,
        data: error?.data,
      });
      cleanup();
      reject(error);
    };

    const onDisconnect = (reason) => {
      console.log(`Socket disconnected: ${reason}`);
    };

    const onUpdate = (payload) => {
      console.log("Received update:", JSON.stringify(payload, null, 2));
      cleanup();
      resolve(payload);
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("space-overview:updated", onUpdate);
    socket.connect();
  });

  try {
    await done;
    console.log("Socket smoke test passed.");
  } catch (error) {
    console.error("Socket smoke test failed:", error.message);
    process.exitCode = 1;
  }

  await wait(50);
}

main();
