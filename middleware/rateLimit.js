import rateLimit from "express-rate-limit";

// express-rate-limit v8 returns 429 with its own body; route everything through
// the app's error shape instead so clients only ever parse one format.
const jsonHandler = (message) => (req, res) => {
  res.status(429).json({ success: false, message });
};

/**
 * Credential endpoints: login, register, password reset. Tight enough to make
 * credential stuffing impractical, loose enough that a staff member fumbling
 * their password a few times is unaffected.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: jsonHandler(
    "Too many authentication attempts. Please try again in a few minutes.",
  ),
});

/**
 * Everything else. Generous — this is a backstop against runaway clients and
 * scraping, not a business rule.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: jsonHandler("Too many requests. Please slow down."),
});
