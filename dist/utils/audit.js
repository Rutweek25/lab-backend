"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = void 0;
const prisma_1 = require("../config/prisma");
const writeAuditLog = async (input) => {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: input.actorId,
                actorRole: input.actorRole,
                entityType: input.entityType,
                entityId: input.entityId,
                action: input.action,
                metadata: input.metadata
            }
        });
    }
    catch (_error) {
        // audit logging must never break request flow
    }
};
exports.writeAuditLog = writeAuditLog;
