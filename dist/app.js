"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./routes"));
const env_1 = require("./config/env");
const errorMiddleware_1 = require("./middlewares/errorMiddleware");
const securityMiddleware_1 = require("./middlewares/securityMiddleware");
const app = (0, express_1.default)();
const allowedOrigins = new Set([
    env_1.env.CLIENT_URL,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175"
]);
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true;
    if (env_1.env.NODE_ENV === "development")
        return true;
    if (allowedOrigins.has(origin))
        return true;
    try {
        const parsed = new URL(origin);
        const isVercelHost = parsed.hostname.endsWith(".vercel.app");
        if (isVercelHost) {
            return true;
        }
        const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        const port = Number(parsed.port);
        if (isLocalHost && Number.isFinite(port) && port >= 5173 && port <= 5199) {
            return true;
        }
    }
    catch {
        return false;
    }
    return false;
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("CORS not allowed"));
    }
}));
app.use(securityMiddleware_1.requestLogger);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/uploads", express_1.default.static(path_1.default.resolve("uploads")));
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api", (0, securityMiddleware_1.rateLimit)({ windowMs: 60000, max: 300, keyPrefix: "api" }), routes_1.default);
app.use("/api/v1", (0, securityMiddleware_1.rateLimit)({ windowMs: 60000, max: 300, keyPrefix: "api-v1" }), routes_1.default);
app.use(errorMiddleware_1.notFound);
app.use(errorMiddleware_1.errorHandler);
exports.default = app;
