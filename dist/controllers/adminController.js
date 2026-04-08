"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettings = exports.getSettings = exports.listOrdersByAdmin = exports.listReportsByAdmin = exports.listPaymentsByAdmin = exports.deleteTestByAdmin = exports.updateTestByAdmin = exports.createTestByAdmin = exports.listTestsByAdmin = exports.toggleUserStatusByAdmin = exports.deleteUserByAdmin = exports.updateUserByAdmin = exports.createUserByAdmin = exports.listUsers = exports.getAdminSummary = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const toDateKey = (value) => value.toISOString().slice(0, 10);
const groupByDate = (items) => {
    const grouped = new Map();
    for (const item of items) {
        const key = toDateKey(item.createdAt);
        const amount = Number(item.amount ?? 1);
        grouped.set(key, Number(grouped.get(key) ?? 0) + amount);
    }
    return Array.from(grouped.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, value]) => ({ date, value }));
};
const getAdminSummary = async (_req, res, next) => {
    try {
        const [doctors, technicians, patientCount, orderCount, payments, tests, orders, allOrderTests, doctorOrders] = await Promise.all([
            prisma_1.prisma.user.count({ where: { role: "DOCTOR", isActive: true } }),
            prisma_1.prisma.user.count({ where: { role: "TECHNICIAN" } }),
            prisma_1.prisma.patient.count({ where: { isDeleted: false } }),
            prisma_1.prisma.order.count({ where: { isDeleted: false } }),
            prisma_1.prisma.payment.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" } }),
            prisma_1.prisma.test.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.order.findMany({ where: { isDeleted: false }, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
            prisma_1.prisma.orderTest.findMany({
                where: {
                    order: { isDeleted: false },
                    test: { isDeleted: false }
                },
                include: {
                    test: true
                }
            }),
            prisma_1.prisma.order.findMany({
                where: { isDeleted: false },
                include: {
                    doctor: { select: { id: true, name: true } },
                    payments: {
                        where: { isDeleted: false },
                        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                        take: 1
                    }
                }
            })
        ]);
        const revenue = payments
            .filter((payment) => payment.status === "PAID")
            .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const pendingPayments = payments.filter((payment) => payment.status === "PENDING").length;
        const revenueOverTime = groupByDate(payments
            .filter((payment) => payment.status === "PAID")
            .map((payment) => ({ createdAt: payment.createdAt, amount: Number(payment.amount) })));
        const ordersPerDay = groupByDate(orders.map((order) => ({ createdAt: order.createdAt, amount: 1 })));
        const paidCount = payments.filter((payment) => payment.status === "PAID").length;
        const pendingCount = payments.filter((payment) => payment.status === "PENDING").length;
        const testRevenueMap = new Map();
        const testCountMap = new Map();
        for (const item of allOrderTests) {
            const testName = item.test.name;
            testRevenueMap.set(testName, Number(testRevenueMap.get(testName) ?? 0) + Number(item.unitPrice));
            testCountMap.set(testName, Number(testCountMap.get(testName) ?? 0) + 1);
        }
        const revenueByTest = Array.from(testRevenueMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
        const topTests = Array.from(testCountMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
        const doctorPerformanceMap = new Map();
        for (const order of doctorOrders) {
            const key = `${order.doctor.id}:${order.doctor.name}`;
            const current = doctorPerformanceMap.get(key) ?? { orders: 0, paidOrders: 0 };
            const latestPayment = order.payments[0];
            doctorPerformanceMap.set(key, {
                orders: current.orders + 1,
                paidOrders: current.paidOrders + (latestPayment?.status === "PAID" ? 1 : 0)
            });
        }
        const doctorPerformance = Array.from(doctorPerformanceMap.entries())
            .map(([key, value]) => {
            const [, name] = key.split(":");
            return {
                name,
                orders: value.orders,
                paidOrders: value.paidOrders
            };
        })
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 8);
        res.json({
            cards: {
                totalDoctors: doctors,
                totalLabTechnicians: technicians,
                patientCount,
                orderCount,
                revenue,
                pendingPayments
            },
            charts: {
                revenueOverTime,
                ordersPerDay,
                revenueByTest,
                topTests,
                doctorPerformance,
                paymentStatusBreakdown: [
                    { name: "PAID", value: paidCount },
                    { name: "PENDING", value: pendingCount }
                ]
            },
            recentTests: tests
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminSummary = getAdminSummary;
const listUsers = async (_req, res, next) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true
            },
            orderBy: { createdAt: "desc" }
        });
        res.json(users);
    }
    catch (error) {
        next(error);
    }
};
exports.listUsers = listUsers;
const createUserByAdmin = async (req, res, next) => {
    try {
        const { name, email, role, password } = req.body;
        if (!name || !email || !role) {
            throw new ApiError_1.ApiError(400, "Name, email and role are required");
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            throw new ApiError_1.ApiError(409, "Email already exists");
        }
        const hashedPassword = await bcryptjs_1.default.hash(password || "password123", 10);
        const user = await prisma_1.prisma.user.create({
            data: {
                name,
                email,
                role,
                password: hashedPassword,
                isActive: true
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true
            }
        });
        res.status(201).json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.createUserByAdmin = createUserByAdmin;
const updateUserByAdmin = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        const { name, email, role, password, isActive } = req.body;
        const existing = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!existing) {
            throw new ApiError_1.ApiError(404, "User not found");
        }
        const user = await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                ...(name ? { name } : {}),
                ...(email ? { email } : {}),
                ...(role ? { role } : {}),
                ...(typeof isActive === "boolean" ? { isActive } : {}),
                ...(password ? { password: await bcryptjs_1.default.hash(password, 10) } : {})
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true
            }
        });
        res.json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.updateUserByAdmin = updateUserByAdmin;
const deleteUserByAdmin = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        if (req.user?.id === userId) {
            throw new ApiError_1.ApiError(400, "You cannot delete your own account");
        }
        await prisma_1.prisma.user.delete({ where: { id: userId } });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.deleteUserByAdmin = deleteUserByAdmin;
const toggleUserStatusByAdmin = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        const { isActive } = req.body;
        const user = await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { isActive: Boolean(isActive) },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true
            }
        });
        res.json(user);
    }
    catch (error) {
        next(error);
    }
};
exports.toggleUserStatusByAdmin = toggleUserStatusByAdmin;
const listTestsByAdmin = async (_req, res, next) => {
    try {
        const tests = await prisma_1.prisma.test.findMany({ where: { isDeleted: false }, orderBy: { name: "asc" } });
        res.json(tests);
    }
    catch (error) {
        next(error);
    }
};
exports.listTestsByAdmin = listTestsByAdmin;
const createTestByAdmin = async (req, res, next) => {
    try {
        const { name, price } = req.body;
        if (!name || Number(price) <= 0) {
            throw new ApiError_1.ApiError(400, "Valid name and price are required");
        }
        const test = await prisma_1.prisma.test.create({
            data: { name, price: Number(price) }
        });
        res.status(201).json(test);
    }
    catch (error) {
        next(error);
    }
};
exports.createTestByAdmin = createTestByAdmin;
const updateTestByAdmin = async (req, res, next) => {
    try {
        const testId = Number(req.params.id);
        const { name, price } = req.body;
        const test = await prisma_1.prisma.test.update({
            where: { id: testId },
            data: {
                ...(name ? { name } : {}),
                ...(typeof price === "number" ? { price: Number(price) } : {})
            }
        });
        res.json(test);
    }
    catch (error) {
        next(error);
    }
};
exports.updateTestByAdmin = updateTestByAdmin;
const deleteTestByAdmin = async (req, res, next) => {
    try {
        const testId = Number(req.params.id);
        await prisma_1.prisma.test.update({ where: { id: testId }, data: { isDeleted: true, deletedAt: new Date() } });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.deleteTestByAdmin = deleteTestByAdmin;
const listPaymentsByAdmin = async (req, res, next) => {
    try {
        const { status, startDate, endDate } = req.query;
        const payments = await prisma_1.prisma.payment.findMany({
            where: {
                isDeleted: false,
                order: { isDeleted: false },
                ...(status ? { status } : {}),
                ...(startDate || endDate
                    ? {
                        createdAt: {
                            ...(startDate ? { gte: new Date(startDate) } : {}),
                            ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {})
                        }
                    }
                    : {})
            },
            include: {
                order: {
                    include: {
                        patient: true,
                        orderTests: { include: { test: true } }
                    }
                }
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        const totalRevenue = payments
            .filter((payment) => payment.status === "PAID")
            .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const pendingPayments = payments.filter((payment) => payment.status === "PENDING").length;
        res.json({
            totalRevenue,
            pendingPayments,
            rows: payments.map((payment) => ({
                id: payment.id,
                orderId: payment.orderId,
                patientName: payment.order.patient.name,
                tests: payment.order.orderTests.map((ot) => ot.test.name),
                amount: Number(payment.amount),
                status: payment.status,
                method: payment.method,
                createdAt: payment.createdAt
            }))
        });
    }
    catch (error) {
        next(error);
    }
};
exports.listPaymentsByAdmin = listPaymentsByAdmin;
const listReportsByAdmin = async (req, res, next) => {
    try {
        const { status } = req.query;
        const reports = await prisma_1.prisma.report.findMany({
            where: {
                isDeleted: false,
                ...(status ? { status } : {})
            },
            include: {
                order: { include: { patient: true } }
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        res.json(reports.map((report) => ({
            id: report.id,
            orderId: report.orderId,
            patientName: report.order.patient.name,
            status: report.status,
            fileName: report.fileName,
            fileUrl: report.fileUrl,
            createdAt: report.createdAt
        })));
    }
    catch (error) {
        next(error);
    }
};
exports.listReportsByAdmin = listReportsByAdmin;
const listOrdersByAdmin = async (_req, res, next) => {
    try {
        const orders = await prisma_1.prisma.order.findMany({
            where: { isDeleted: false },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true, email: true } },
                orderTests: { include: { test: true } },
                payments: { where: { isDeleted: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
                reports: { where: { isDeleted: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        res.json(orders);
    }
    catch (error) {
        next(error);
    }
};
exports.listOrdersByAdmin = listOrdersByAdmin;
const getSettings = async (_req, res) => {
    res.json({
        appName: "Lab Management System",
        currency: "Rs.",
        defaultRole: "DOCTOR",
        allowSelfRegistration: false
    });
};
exports.getSettings = getSettings;
const updateSettings = async (req, res) => {
    const payload = req.body;
    res.json({
        message: "Settings updated",
        settings: {
            appName: payload.appName || "Lab Management System",
            currency: payload.currency || "Rs.",
            defaultRole: payload.defaultRole || "DOCTOR",
            allowSelfRegistration: Boolean(payload.allowSelfRegistration)
        }
    });
};
exports.updateSettings = updateSettings;
