"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = void 0;
const client_1 = require("@prisma/client");
const ApiError_1 = require("../utils/ApiError");
const notFound = (_req, res) => {
    res.status(404).json({ message: "Route not found" });
};
exports.notFound = notFound;
const errorHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError_1.ApiError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        return res.status(400).json({ message: error.message });
    }
    if (error instanceof client_1.Prisma.PrismaClientInitializationError) {
        return res.status(503).json({
            message: "Database connection failed. Check DATABASE_URL and MySQL credentials."
        });
    }
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        return res.status(400).json({ message: "Invalid database query payload." });
    }
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
};
exports.errorHandler = errorHandler;
