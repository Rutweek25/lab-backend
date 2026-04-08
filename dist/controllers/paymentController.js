"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentStatus = exports.generateInvoice = exports.paymentHistory = exports.listPayments = exports.createPayment = void 0;
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const pdf_1 = require("../utils/pdf");
const socket_1 = require("../config/socket");
const audit_1 = require("../utils/audit");
const notification_1 = require("../utils/notification");
const calculateOrderTotal = async (orderId) => {
    const orderTests = await prisma_1.prisma.orderTest.findMany({
        where: { orderId, order: { isDeleted: false } },
        include: { test: true }
    });
    return orderTests.reduce((sum, item) => sum + Number(item.unitPrice), 0);
};
const createPayment = async (req, res, next) => {
    try {
        const orderId = Number(req.params.orderId);
        const { status, method, amount } = req.body;
        const order = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!order) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        const computedAmount = amount ? Number(amount) : await calculateOrderTotal(orderId);
        const payment = await prisma_1.prisma.payment.create({
            data: {
                orderId,
                amount: computedAmount,
                status,
                method,
                isDeleted: false
            }
        });
        const io = (0, socket_1.getSocketServer)();
        io.emit("payment:updated", payment);
        await (0, notification_1.pushNotification)({
            recipientIds: [order.doctorId],
            type: "PAYMENT_UPDATED",
            title: "Payment updated",
            message: `Payment ${status} for request #${orderId}`,
            entityType: "Payment",
            entityId: payment.id,
            metadata: { orderId, status }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Payment",
            entityId: payment.id,
            action: "CREATE",
            metadata: { orderId, status }
        });
        res.status(201).json(payment);
    }
    catch (error) {
        next(error);
    }
};
exports.createPayment = createPayment;
const listPayments = async (req, res, next) => {
    try {
        const status = req.query.status;
        const search = req.query.search?.trim();
        const orders = await prisma_1.prisma.order.findMany({
            where: {
                isDeleted: false,
                ...(search
                    ? {
                        patient: {
                            OR: [
                                { name: { contains: search, mode: "insensitive" } },
                                { phone: { contains: search, mode: "insensitive" } }
                            ]
                        }
                    }
                    : {})
            },
            include: {
                patient: true,
                orderTests: { include: { test: true } },
                payments: {
                    where: { isDeleted: false },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
                }
            },
            orderBy: { createdAt: "desc" }
        });
        const rows = orders
            .map((order) => {
            const totalAmount = order.orderTests.reduce((sum, item) => sum + Number(item.unitPrice), 0);
            const latestPayment = order.payments[0];
            const paymentStatus = latestPayment?.status === "PAID" ? "PAID" : "PENDING";
            return {
                orderId: order.id,
                patientName: order.patient.name,
                phone: order.patient.phone,
                tests: order.orderTests.map((item) => item.test.name),
                totalAmount,
                paymentStatus
            };
        })
            .filter((row) => (status ? row.paymentStatus === status : true));
        res.json(rows);
    }
    catch (error) {
        next(error);
    }
};
exports.listPayments = listPayments;
const paymentHistory = async (req, res, next) => {
    try {
        const orderId = Number(req.params.orderId);
        const payments = await prisma_1.prisma.payment.findMany({
            where: { orderId, isDeleted: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        res.json(payments);
    }
    catch (error) {
        next(error);
    }
};
exports.paymentHistory = paymentHistory;
const generateInvoice = async (req, res, next) => {
    try {
        const orderId = Number(req.params.orderId);
        const order = await prisma_1.prisma.order.findFirst({
            where: { id: orderId, isDeleted: false },
            include: {
                patient: true,
                orderTests: { include: { test: true } },
                payments: {
                    where: { isDeleted: false },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    take: 1
                }
            }
        });
        if (!order) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        const total = order.orderTests.reduce((sum, item) => sum + Number(item.unitPrice), 0);
        const latestPayment = order.payments[0];
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename=invoice-${orderId}.pdf`);
        (0, pdf_1.generateInvoicePdf)(res, {
            orderId: order.id,
            invoiceNumber: `INV-${String(order.id).padStart(6, "0")}`,
            patientName: order.patient.name,
            tests: order.orderTests.map((ot) => ({
                name: ot.test.name,
                price: Number(ot.unitPrice)
            })),
            amount: total,
            status: latestPayment?.status ?? "PENDING"
        });
    }
    catch (error) {
        next(error);
    }
};
exports.generateInvoice = generateInvoice;
const updatePaymentStatus = async (req, res, next) => {
    try {
        const orderId = Number(req.params.id);
        const { status } = req.body;
        if (status !== "PAID" && status !== "PENDING") {
            throw new ApiError_1.ApiError(400, "Invalid payment status");
        }
        const order = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!order) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        const totalAmount = await calculateOrderTotal(orderId);
        const latestPayment = await prisma_1.prisma.payment.findFirst({
            where: { orderId, isDeleted: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        const payment = latestPayment
            ? await prisma_1.prisma.payment.update({
                where: { id: latestPayment.id },
                data: { status, amount: totalAmount }
            })
            : await prisma_1.prisma.payment.create({
                data: {
                    orderId,
                    amount: totalAmount,
                    status,
                    method: "CASH",
                    isDeleted: false
                }
            });
        const io = (0, socket_1.getSocketServer)();
        io.emit("payment:updated", payment);
        await (0, notification_1.pushNotification)({
            recipientIds: [order.doctorId],
            type: "PAYMENT_UPDATED",
            title: "Payment updated",
            message: `Payment ${status} for request #${orderId}`,
            entityType: "Payment",
            entityId: payment.id,
            metadata: { orderId, status }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Payment",
            entityId: payment.id,
            action: "UPDATE_STATUS",
            metadata: { orderId, status }
        });
        res.json({ message: "Updated successfully", payment });
    }
    catch (error) {
        next(error);
    }
};
exports.updatePaymentStatus = updatePaymentStatus;
