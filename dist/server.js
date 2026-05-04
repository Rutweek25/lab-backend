"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const socket_1 = require("./config/socket");
const server = http_1.default.createServer(app_1.default);
const configuredOrigins = env_1.env.CLIENT_URL
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }
    return configuredOrigins.includes(origin) || localhostOriginPattern.test(origin);
};
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Socket CORS blocked for origin: ${origin || "unknown"}`));
        },
        credentials: true
    }
});
io.on("connection", (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
            socket.join(`role:${decoded.role}`);
            socket.join(`user:${decoded.id}`);
        }
        catch (_error) {
            // invalid token: keep anonymous socket for public health only
        }
    }
    socket.on("disconnect", () => {
        // no-op
    });
});
(0, socket_1.setSocketServer)(io);
server.listen(env_1.env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env_1.env.PORT}`);
});
