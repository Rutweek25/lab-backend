"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAuditLogs = void 0;
const prisma_1 = require("../config/prisma");
const listAuditLogs = async (req, res, next) => {
    try {
        const { entityType, action, search } = req.query;
        const logs = await prisma_1.prisma.auditLog.findMany({
            where: {
                ...(entityType ? { entityType } : {}),
                ...(action ? { action } : {}),
                ...(search
                    ? {
                        OR: [
                            { entityType: { contains: search, mode: "insensitive" } },
                            { action: { contains: search, mode: "insensitive" } }
                        ]
                    }
                    : {})
            },
            orderBy: { createdAt: "desc" },
            take: 100
        });
        res.json(logs);
    }
    catch (error) {
        next(error);
    }
};
exports.listAuditLogs = listAuditLogs;
