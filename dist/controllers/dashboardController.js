"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalytics = void 0;
const prisma_1 = require("../config/prisma");
const getAnalytics = async (_req, res, next) => {
    try {
        const [payments, testUsage, orderCount] = await Promise.all([
            prisma_1.prisma.payment.findMany({ where: { status: "PAID" } }),
            prisma_1.prisma.orderTest.groupBy({
                by: ["testId"],
                _count: { testId: true },
                orderBy: { _count: { testId: "desc" } },
                take: 5
            }),
            prisma_1.prisma.order.count()
        ]);
        const revenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const testIds = testUsage.map((t) => t.testId);
        const tests = await prisma_1.prisma.test.findMany({ where: { id: { in: testIds } } });
        const testsById = Object.fromEntries(tests.map((t) => [t.id, t.name]));
        res.json({
            summary: {
                revenue,
                paidPayments: payments.length,
                orderCount
            },
            topTests: testUsage.map((t) => ({
                testId: t.testId,
                name: testsById[t.testId] ?? "Unknown",
                count: t._count.testId
            }))
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalytics = getAnalytics;
