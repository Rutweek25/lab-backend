"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalSearch = void 0;
const prisma_1 = require("../config/prisma");
const globalSearch = async (req, res, next) => {
    try {
        const q = req.query.q?.trim();
        if (!q) {
            return res.json({ patients: [], orders: [], reports: [] });
        }
        const [patients, orders, reports] = await Promise.all([
            prisma_1.prisma.patient.findMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { phone: { contains: q, mode: "insensitive" } }
                    ]
                },
                take: 10,
                orderBy: { createdAt: "desc" }
            }),
            prisma_1.prisma.order.findMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { patient: { name: { contains: q, mode: "insensitive" } } },
                        { patient: { phone: { contains: q, mode: "insensitive" } } },
                        { reports: { some: { isDeleted: false, fileName: { contains: q, mode: "insensitive" } } } },
                        { reports: { some: { isDeleted: false, status: { contains: q, mode: "insensitive" } } } },
                        ...(Number.isFinite(Number(q)) ? [{ id: Number(q) }] : [])
                    ]
                },
                include: {
                    patient: true,
                    doctor: { select: { id: true, name: true } }
                },
                take: 10,
                orderBy: { createdAt: "desc" }
            }),
            prisma_1.prisma.report.findMany({
                where: {
                    isDeleted: false,
                    OR: [
                        { fileName: { contains: q, mode: "insensitive" } },
                        { status: { contains: q, mode: "insensitive" } },
                        { order: { patient: { name: { contains: q, mode: "insensitive" } } } },
                        { order: { patient: { phone: { contains: q, mode: "insensitive" } } } },
                        ...(Number.isFinite(Number(q)) ? [{ orderId: Number(q) }] : [])
                    ]
                },
                include: {
                    order: {
                        include: {
                            patient: true
                        }
                    }
                },
                take: 10,
                orderBy: { createdAt: "desc" }
            })
        ]);
        res.json({ patients, orders, reports });
    }
    catch (error) {
        next(error);
    }
};
exports.globalSearch = globalSearch;
