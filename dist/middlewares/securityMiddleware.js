"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = exports.requestLogger = void 0;
const ApiError_1 = require("../utils/ApiError");
const buckets = new Map();
const requestLogger = (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - startedAt;
        // eslint-disable-next-line no-console
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
};
exports.requestLogger = requestLogger;
const rateLimit = (options) => {
    return (req, _res, next) => {
        const key = `${options.keyPrefix}:${req.ip || req.headers["x-forwarded-for"] || "unknown"}`;
        const now = Date.now();
        const bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + options.windowMs });
            return next();
        }
        if (bucket.count >= options.max) {
            return next(new ApiError_1.ApiError(429, "Too many requests. Please try again later."));
        }
        bucket.count += 1;
        buckets.set(key, bucket);
        return next();
    };
};
exports.rateLimit = rateLimit;
