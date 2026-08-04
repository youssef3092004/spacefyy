import jwt from "jsonwebtoken";
import process from "process";
import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

// Tokens live for days, so the role baked into one goes stale: a user demoted
// from OWNER to STAFF, or soft-deleted, kept full access until it expired.
// The live record is authoritative; this cache just keeps it off the hot path.
const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX_ENTRIES = 5000;
const userCache = new Map();

const loadCurrentUser = async (userId) => {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      roleId: true,
      isDeleted: true,
      role: { select: { name: true } },
    },
  });

  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });

  if (userCache.size > USER_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (entry.expiresAt <= now) userCache.delete(key);
    }
    // Dropping expired entries alone is not a bound: a burst of distinct users
    // inside one TTL window leaves them all live. Map iterates in insertion
    // order, so evicting from the front sheds the oldest first. Evicting early
    // is always safe — the next request just reloads from the database.
    for (const key of userCache.keys()) {
      if (userCache.size <= USER_CACHE_MAX_ENTRIES) break;
      userCache.delete(key);
    }
  }

  return user;
};

// Called after a role change, a delete, or a logout so the next request sees
// the new state instead of waiting out the TTL.
export const invalidateUserAuthCache = (userId) => {
  if (userId) userCache.delete(userId);
};

// Populates req.user when a valid token is present, but does not reject when it
// is missing. Only for endpoints that must stay reachable during bootstrap —
// the handler itself is responsible for authorizing.
export const verifyTokenIfPresent = async (req, res, next) => {
  if (!req.headers.authorization) return next();
  return verifyToken(req, res, next);
};

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next(new AppError("Authorization header missing", 401));
    }
    if (!authHeader.startsWith("Bearer ")) {
      return next(new AppError("Authorization header malformed", 401));
    }
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
      return next(new AppError("No token provided", 401));
    }

    const exsistToken = await prisma.blacklistedToken.findUnique({
      where: { token },
      select: { id: true },
    });
    if (exsistToken) {
      return next(new AppError("Authorization denied: Token is Expired", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Handle old tokens that use 'roles' instead of 'roleName'
    if (decoded.roles && !decoded.roleName) {
      decoded.roleName = decoded.roles;
    }

    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return next(new AppError("Invalid token", 401));
    }

    const currentUser = await loadCurrentUser(userId);
    if (!currentUser || currentUser.isDeleted) {
      return next(new AppError("Account is no longer active", 401));
    }

    // Role comes from the database, never from the token payload.
    req.user = {
      ...decoded,
      id: currentUser.id,
      userId: currentUser.id,
      roleId: currentUser.roleId,
      roleName: currentUser.role?.name ?? null,
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError("Token expired, please login again", 401));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token", 401));
    }
    next(err);
  }
};
