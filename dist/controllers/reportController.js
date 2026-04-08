"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReportStatus = exports.downloadReport = exports.listReports = exports.uploadReport = void 0;
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const socket_1 = require("../config/socket");
const audit_1 = require("../utils/audit");
const notification_1 = require("../utils/notification");
const domain_1 = require("../types/domain");
const uploadReport = async (req, res, next) => {
    try {
        const orderId = Number(req.params.orderId || req.body.orderId);
        if (!req.file) {
            throw new ApiError_1.ApiError(400, "Report file is required");
        }
        if (!orderId) {
            throw new ApiError_1.ApiError(400, "Order ID is required");
        }
        const order = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!order) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        const existingReports = await prisma_1.prisma.report.findMany({ where: { orderId, isDeleted: false } });
        if (existingReports.length) {
            await prisma_1.prisma.report.updateMany({
                where: { orderId, isDeleted: false },
                data: { isDeleted: true, deletedAt: new Date() }
            });
        }
        const fileName = req.file.filename;
        const report = await prisma_1.prisma.report.create({
            data: {
                orderId,
                fileName: req.file.originalname,
                fileUrl: `/uploads/reports/${fileName}`,
                filePath: req.file.path,
                fileType: req.file.mimetype,
                status: "UPLOADED",
                isDeleted: false
            }
        });
        const io = (0, socket_1.getSocketServer)();
        io.emit("report:uploaded", report);
        await (0, notification_1.pushNotification)({
            recipientIds: [order.doctorId],
            type: "REPORT_UPLOADED",
            title: "Report uploaded",
            message: `A new report is available for request #${orderId}`,
            entityType: "Report",
            entityId: report.id,
            metadata: { orderId, reportId: report.id }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Report",
            entityId: report.id,
            action: "UPLOAD",
            metadata: { orderId }
        });
        res.status(201).json({ message: "Updated successfully", report });
    }
    catch (error) {
        next(error);
    }
};
exports.uploadReport = uploadReport;
const listReports = async (req, res, next) => {
    try {
        const orderId = Number(req.params.orderId);
        const reports = await prisma_1.prisma.report.findMany({
            where: { orderId, isDeleted: false },
            orderBy: { createdAt: "desc" }
        });
        res.json(reports);
    }
    catch (error) {
        next(error);
    }
};
exports.listReports = listReports;
const downloadReport = async (req, res, next) => {
    try {
        const reportId = Number(req.params.id);
        const report = await prisma_1.prisma.report.findFirst({ where: { id: reportId, isDeleted: false } });
        if (!report) {
            throw new ApiError_1.ApiError(404, "Report not found");
        }
        const filePath = path_1.default.resolve(report.filePath);
        res.download(filePath, report.fileName);
    }
    catch (error) {
        next(error);
    }
};
exports.downloadReport = downloadReport;
const updateReportStatus = async (req, res, next) => {
    try {
        const reportId = Number(req.params.id);
        const { status } = req.body;
        if (!status || !domain_1.reportStatuses.includes(status)) {
            throw new ApiError_1.ApiError(400, "Invalid report status");
        }
        const existing = await prisma_1.prisma.report.findFirst({
            where: { id: reportId, isDeleted: false },
            include: { order: true }
        });
        if (!existing) {
            throw new ApiError_1.ApiError(404, "Report not found");
        }
        const report = await prisma_1.prisma.report.update({
            where: { id: reportId },
            data: { status: status }
        });
        (0, socket_1.getSocketServer)().emit("report:updated", report);
        await (0, notification_1.pushNotification)({
            recipientIds: [existing.order.doctorId],
            type: "REPORT_STATUS_UPDATED",
            title: "Report status updated",
            message: `Report #${reportId} is now ${status}`,
            entityType: "Report",
            entityId: reportId,
            metadata: { status }
        });
        res.json({ message: "Report status updated", report });
    }
    catch (error) {
        next(error);
    }
};
exports.updateReportStatus = updateReportStatus;
