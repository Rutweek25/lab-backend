"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRole = exports.authorize = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const domain_1 = require("../types/domain");
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
const protect = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) {
        return next(new ApiError_1.ApiError(401, "Unauthorized"));
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        req.user = {
            id: decoded.id,
            role: decoded.role,
            email: decoded.email,
            name: decoded.name
        };
        return next();
    }
    catch (_error) {
        return next(new ApiError_1.ApiError(401, "Invalid token"));
    }
};
exports.protect = protect;
const authorize = (...roles) => {
    return (req, _res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new ApiError_1.ApiError(403, "Forbidden"));
        }
        return next();
    };
};
exports.authorize = authorize;
const authorizeRole = (role) => {
    const mappedRole = role === "LAB" ? domain_1.roles[1] : role;
    return (0, exports.authorize)(mappedRole);
};
exports.authorizeRole = authorizeRole;
