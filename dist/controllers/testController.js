"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTest = exports.updateTest = exports.listTests = exports.createTest = void 0;
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const audit_1 = require("../utils/audit");
const createTest = async (req, res, next) => {
    try {
        const { name, price } = req.body;
        if (!name || Number(price) <= 0) {
            throw new ApiError_1.ApiError(400, "Valid name and price are required");
        }
        const test = await prisma_1.prisma.test.create({
            data: {
                name,
                price: Number(price)
            }
        });
        res.status(201).json(test);
    }
    catch (error) {
        next(error);
    }
};
exports.createTest = createTest;
const listTests = async (_req, res, next) => {
    try {
        const tests = await prisma_1.prisma.test.findMany({ where: { isDeleted: false }, orderBy: { name: "asc" } });
        res.json(tests);
    }
    catch (error) {
        next(error);
    }
};
exports.listTests = listTests;
const updateTest = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const { name, price } = req.body;
        const existingTest = await prisma_1.prisma.test.findFirst({ where: { id, isDeleted: false } });
        if (!existingTest) {
            throw new ApiError_1.ApiError(404, "Test not found");
        }
        const test = await prisma_1.prisma.test.update({
            where: { id },
            data: {
                ...(name ? { name } : {}),
                ...(price ? { price: Number(price) } : {})
            }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Test",
            entityId: id,
            action: "UPDATE",
            metadata: { name, price }
        });
        res.json(test);
    }
    catch (error) {
        next(error);
    }
};
exports.updateTest = updateTest;
const deleteTest = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.prisma.test.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Test",
            entityId: id,
            action: "SOFT_DELETE"
        });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.deleteTest = deleteTest;
