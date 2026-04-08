"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.listNotifications = void 0;
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const listNotifications = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const [notifications, unreadCount] = await Promise.all([
            prisma_1.prisma.notification.findMany({
                where: { recipientId: req.user.id },
                orderBy: { createdAt: "desc" },
                take: 20
            }),
            prisma_1.prisma.notification.count({ where: { recipientId: req.user.id, isRead: false } })
        ]);
        res.json({ notifications, unreadCount });
    }
    catch (error) {
        next(error);
    }
};
exports.listNotifications = listNotifications;
const markNotificationAsRead = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const notificationId = Number(req.params.id);
        const notification = await prisma_1.prisma.notification.findFirst({
            where: { id: notificationId, recipientId: req.user.id }
        });
        if (!notification) {
            throw new ApiError_1.ApiError(404, "Notification not found");
        }
        const updated = await prisma_1.prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
        });
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
const markAllNotificationsAsRead = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        await prisma_1.prisma.notification.updateMany({
            where: { recipientId: req.user.id, isRead: false },
            data: { isRead: true }
        });
        res.json({ message: "Notifications marked as read" });
    }
    catch (error) {
        next(error);
    }
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
