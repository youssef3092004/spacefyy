import { createClient } from "redis";
import process from "process";

export const redisClient = createClient({
  username: process.env.USERNAME_REDIS,
  password: process.env.PASSWORD_REDIS,
  socket: {
    host: process.env.HOST_REDIS,
    port: parseInt(process.env.PORT_REDIS),
  },
});
export async function connectRedis() {
  try {
    await redisClient.connect();
    console.log("Redis connected successfully");
  } catch (err) {
    console.error("Redis connection failed:", err);
  }
}
