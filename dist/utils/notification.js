"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushNotification = void 0;
const prisma_1 = require("../config/prisma");
const socket_1 = require("../config/socket");
const pushNotification = async (input) => {
    const recipientIds = Array.from(new Set(input.recipientIds.filter((value) => Number.isFinite(value))));
    if (!recipientIds.length) {
        return [];
    }
    const notifications = await Promise.all(recipientIds.map((recipientId) => prisma_1.prisma.notification.create({
        data: {
            recipientId,
            type: input.type,
            title: input.title,
            message: input.message,
            entityType: input.entityType,
            entityId: input.entityId,
            metadata: input.metadata
        }
    })));
    const io = (0, socket_1.getSocketServer)();
    notifications.forEach((notification) => {
        io.to(`user:${notification.recipientId}`).emit("notification:new", notification);
    });
    return notifications;
};
exports.pushNotification = pushNotification;
