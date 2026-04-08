"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOrderByLab = exports.updateOrderSampleStatusByLab = exports.updateOrderStatusByLab = exports.updateOrderTestsByLab = exports.deleteOrder = exports.updateOrder = exports.listOrders = exports.createOrderForExistingPatient = exports.createOrderWithPatient = exports.createOrder = void 0;
const domain_1 = require("../types/domain");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const socket_1 = require("../config/socket");
const pagination_1 = require("../utils/pagination");
const audit_1 = require("../utils/audit");
const notification_1 = require("../utils/notification");
const orderInclude = {
    patient: true,
    doctor: { select: { id: true, name: true } },
    orderTests: { include: { test: true } },
    payments: {
        where: { isDeleted: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    },
    reports: {
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" }
    }
};
const getUpdatedLists = async (user) => {
    const [patients, requests] = await Promise.all([
        prisma_1.prisma.patient.findMany({
            where: user.role === domain_1.roles[0] ? { createdById: user.id, isDeleted: false } : { isDeleted: false },
            orderBy: { createdAt: "desc" }
        }),
        prisma_1.prisma.order.findMany({
            where: user.role === domain_1.roles[0] ? { doctorId: user.id, isDeleted: false } : { isDeleted: false },
            include: orderInclude,
            orderBy: { createdAt: "desc" }
        })
    ]);
    return { patients, requests };
};
const createOrderWithTests = async (doctorId, patientId, testIds) => {
    const tests = await prisma_1.prisma.test.findMany({ where: { id: { in: testIds }, isDeleted: false } });
    if (tests.length !== testIds.length) {
        throw new ApiError_1.ApiError(400, "Some tests are invalid");
    }
    return prisma_1.prisma.order.create({
        data: {
            patientId,
            doctorId,
            status: domain_1.orderStatuses[0],
            sampleStatus: domain_1.sampleStatuses[0],
            orderTests: {
                create: tests.map((test) => ({
                    testId: test.id,
                    unitPrice: Number(test.price)
                }))
            }
        },
        include: orderInclude
    });
};
const buildUpdatedItems = async (testIds, testItems) => {
    if (testItems?.length) {
        return testItems.map((item) => ({
            testId: item.testId,
            unitPrice: Number(item.unitPrice)
        }));
    }
    if (testIds?.length) {
        const tests = await prisma_1.prisma.test.findMany({ where: { id: { in: testIds }, isDeleted: false } });
        if (tests.length !== testIds.length) {
            throw new ApiError_1.ApiError(400, "Some tests are invalid");
        }
        return tests.map((test) => ({
            testId: test.id,
            unitPrice: Number(test.price)
        }));
    }
    return undefined;
};
const getTechnicianRecipientIds = async () => {
    const technicians = await prisma_1.prisma.user.findMany({
        where: { role: domain_1.roles[1], isActive: true },
        select: { id: true }
    });
    return technicians.map((technician) => technician.id);
};
const createOrder = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const { patientId, testIds } = req.body;
        if (!patientId || !testIds?.length) {
            throw new ApiError_1.ApiError(400, "Patient and tests are required");
        }
        const order = await createOrderWithTests(req.user.id, Number(patientId), testIds);
        const lists = await getUpdatedLists(req.user);
        const io = (0, socket_1.getSocketServer)();
        io.to("role:TECHNICIAN").emit("order:new", order);
        await (0, notification_1.pushNotification)({
            recipientIds: await getTechnicianRecipientIds(),
            type: "ORDER_CREATED",
            title: "New request created",
            message: `Request #${order.id} was created for ${order.patient.name}`,
            entityType: "Order",
            entityId: order.id,
            metadata: { patientId: order.patientId, testIds }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: order.id,
            action: "CREATE",
            metadata: { patientId: order.patientId, testIds }
        });
        res.status(201).json({
            message: "Order created successfully",
            order,
            lists
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createOrder = createOrder;
const createOrderWithPatient = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const { patient, testIds } = req.body;
        if (!patient?.name || !patient?.phone || !patient?.age || !patient?.gender || !testIds?.length) {
            throw new ApiError_1.ApiError(400, "Patient details and tests are required");
        }
        const normalizedPhone = String(patient.phone || "").trim();
        const parsedAge = Number(patient.age);
        if (!/^\d{10}$/.test(normalizedPhone)) {
            throw new ApiError_1.ApiError(400, "Phone number must be exactly 10 digits");
        }
        if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
            throw new ApiError_1.ApiError(400, "Age must be a valid numeric value");
        }
        const existingPatient = await prisma_1.prisma.patient.findFirst({ where: { phone: normalizedPhone, isDeleted: false } });
        const resolvedPatient = existingPatient ??
            (await prisma_1.prisma.patient.create({
                data: {
                    name: patient.name,
                    phone: normalizedPhone,
                    age: parsedAge,
                    gender: patient.gender,
                    createdById: req.user.id
                }
            }));
        const order = await createOrderWithTests(req.user.id, resolvedPatient.id, testIds);
        const lists = await getUpdatedLists(req.user);
        const io = (0, socket_1.getSocketServer)();
        io.to("role:TECHNICIAN").emit("order:new", order);
        await (0, notification_1.pushNotification)({
            recipientIds: await getTechnicianRecipientIds(),
            type: "ORDER_CREATED",
            title: "New request created",
            message: `Request #${order.id} was created for ${order.patient.name}`,
            entityType: "Order",
            entityId: order.id,
            metadata: { patientPhone: normalizedPhone, testIds }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: order.id,
            action: "CREATE_WITH_PATIENT",
            metadata: { patientPhone: normalizedPhone, testIds }
        });
        res.status(201).json({
            message: "Patient and request created successfully",
            order,
            lists
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createOrderWithPatient = createOrderWithPatient;
const createOrderForExistingPatient = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const { patientId, testIds } = req.body;
        if (!patientId || !testIds?.length) {
            throw new ApiError_1.ApiError(400, "Patient and tests are required");
        }
        const existingPatient = await prisma_1.prisma.patient.findFirst({ where: { id: Number(patientId), isDeleted: false } });
        if (!existingPatient) {
            throw new ApiError_1.ApiError(404, "Patient not found");
        }
        const order = await createOrderWithTests(req.user.id, existingPatient.id, testIds);
        const lists = await getUpdatedLists(req.user);
        const io = (0, socket_1.getSocketServer)();
        io.to("role:TECHNICIAN").emit("order:new", order);
        await (0, notification_1.pushNotification)({
            recipientIds: await getTechnicianRecipientIds(),
            type: "ORDER_CREATED",
            title: "New request created",
            message: `Request #${order.id} was created for ${order.patient.name}`,
            entityType: "Order",
            entityId: order.id,
            metadata: { patientId: existingPatient.id, testIds }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: order.id,
            action: "CREATE_FOR_EXISTING_PATIENT",
            metadata: { patientId: existingPatient.id, testIds }
        });
        res.status(201).json({
            message: "Request created successfully",
            order,
            lists
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createOrderForExistingPatient = createOrderForExistingPatient;
const listOrders = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const { status, page, pageSize, search } = req.query;
        const { skip, page: currentPage, pageSize: perPage } = (0, pagination_1.getPagination)(page, pageSize);
        const where = {
            isDeleted: false,
            ...(req.user.role === domain_1.roles[0] ? { doctorId: req.user.id } : {}),
            ...(status ? { status: status } : {}),
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
        };
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where,
                include: orderInclude,
                orderBy: { createdAt: "desc" },
                skip,
                take: perPage
            }),
            prisma_1.prisma.order.count({ where })
        ]);
        res.json({
            data: orders,
            pagination: {
                total,
                page: currentPage,
                pageSize: perPage,
                totalPages: Math.ceil(total / perPage)
            }
        });
    }
    catch (error) {
        next(error);
    }
};
exports.listOrders = listOrders;
const updateOrder = async (req, res, next) => {
    try {
        const orderId = Number(req.params.id);
        const { status, testItems } = req.body;
        const existingOrder = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!existingOrder) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        if (req.user?.role === domain_1.roles[0] &&
            existingOrder.doctorId !== req.user.id) {
            throw new ApiError_1.ApiError(403, "You can edit only your own requests");
        }
        const updatedItems = await buildUpdatedItems(req.body.testIds, testItems);
        if ((req.body.testIds || testItems) && (!updatedItems || !updatedItems.length)) {
            throw new ApiError_1.ApiError(400, "At least one test is required");
        }
        const updatedOrder = await prisma_1.prisma.$transaction(async (tx) => {
            if (updatedItems) {
                await tx.orderTest.deleteMany({ where: { orderId } });
                await tx.orderTest.createMany({
                    data: updatedItems.map((item) => ({
                        orderId,
                        testId: item.testId,
                        unitPrice: Number(item.unitPrice)
                    }))
                });
            }
            return tx.order.update({
                where: { id: orderId },
                data: {
                    ...(status ? { status } : {})
                },
                include: orderInclude
            });
        });
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const lists = await getUpdatedLists(req.user);
        (0, socket_1.getSocketServer)().emit("order:updated", updatedOrder);
        await (0, audit_1.writeAuditLog)({
            actorId: req.user?.id,
            actorRole: req.user?.role,
            entityType: "Order",
            entityId: orderId,
            action: "UPDATE",
            metadata: { status, hasTestItems: Boolean(updatedItems) }
        });
        res.json({
            message: "Order updated successfully",
            order: updatedOrder,
            lists
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateOrder = updateOrder;
const deleteOrder = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const orderId = Number(req.params.id);
        const existingOrder = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!existingOrder) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        if (req.user.role === domain_1.roles[0] && existingOrder.doctorId !== req.user.id) {
            throw new ApiError_1.ApiError(403, "You can delete only your own requests");
        }
        await prisma_1.prisma.order.update({ where: { id: orderId }, data: { isDeleted: true, deletedAt: new Date() } });
        const lists = await getUpdatedLists(req.user);
        (0, socket_1.getSocketServer)().emit("order:updated", { id: orderId, deleted: true });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: orderId,
            action: "SOFT_DELETE"
        });
        res.json({
            message: "Order deleted successfully",
            deletedOrderId: orderId,
            lists
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteOrder = deleteOrder;
const updateOrderTestsByLab = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== domain_1.roles[1]) {
            throw new ApiError_1.ApiError(403, "Forbidden");
        }
        const orderId = Number(req.params.id);
        const { testIds, testItems } = req.body;
        if (!testIds?.length && !testItems?.length) {
            throw new ApiError_1.ApiError(400, "At least one test is required");
        }
        const updatedOrder = await prisma_1.prisma.$transaction(async (tx) => {
            const resolvedIds = testItems?.length
                ? testItems.map((item) => item.testId)
                : testIds;
            const tests = await tx.test.findMany({ where: { id: { in: resolvedIds }, isDeleted: false } });
            if (tests.length !== resolvedIds.length) {
                throw new ApiError_1.ApiError(400, "Some tests are invalid");
            }
            const priceByTestId = new Map();
            if (testItems?.length) {
                for (const item of testItems) {
                    const price = Number(item.unitPrice);
                    if (!Number.isFinite(price) || price < 0) {
                        throw new ApiError_1.ApiError(400, "Invalid unit price");
                    }
                    priceByTestId.set(item.testId, price);
                }
            }
            await tx.orderTest.deleteMany({ where: { orderId } });
            await tx.orderTest.createMany({
                data: tests.map((test) => ({
                    orderId,
                    testId: test.id,
                    unitPrice: priceByTestId.has(test.id)
                        ? Number(priceByTestId.get(test.id))
                        : Number(test.price)
                }))
            });
            return tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
        });
        if (!updatedOrder) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        (0, socket_1.getSocketServer)().emit("order:updated", updatedOrder);
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: orderId,
            action: "UPDATE_TESTS_BY_LAB"
        });
        res.json({ message: "Updated successfully", order: updatedOrder });
    }
    catch (error) {
        next(error);
    }
};
exports.updateOrderTestsByLab = updateOrderTestsByLab;
const updateOrderStatusByLab = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== domain_1.roles[1]) {
            throw new ApiError_1.ApiError(403, "Forbidden");
        }
        const orderId = Number(req.params.id);
        const { status } = req.body;
        if (!status || !domain_1.orderStatuses.includes(status)) {
            throw new ApiError_1.ApiError(400, "Invalid order status");
        }
        const order = await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { status },
            include: orderInclude
        });
        (0, socket_1.getSocketServer)().emit("order:updated", order);
        await (0, notification_1.pushNotification)({
            recipientIds: [order.doctorId],
            type: "ORDER_STATUS_UPDATED",
            title: "Request status updated",
            message: `Request #${orderId} is now ${status}`,
            entityType: "Order",
            entityId: orderId,
            metadata: { status }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: orderId,
            action: "UPDATE_STATUS_BY_LAB",
            metadata: { status }
        });
        res.json({ message: "Updated successfully", order });
    }
    catch (error) {
        next(error);
    }
};
exports.updateOrderStatusByLab = updateOrderStatusByLab;
const updateOrderSampleStatusByLab = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== domain_1.roles[1]) {
            throw new ApiError_1.ApiError(403, "Forbidden");
        }
        const orderId = Number(req.params.id);
        const { sampleStatus } = req.body;
        if (!sampleStatus || !domain_1.sampleStatuses.includes(sampleStatus)) {
            throw new ApiError_1.ApiError(400, "Invalid sample status");
        }
        const order = await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { sampleStatus },
            include: orderInclude
        });
        (0, socket_1.getSocketServer)().emit("order:updated", order);
        await (0, notification_1.pushNotification)({
            recipientIds: [order.doctorId],
            type: "SAMPLE_STATUS_UPDATED",
            title: "Sample status updated",
            message: `Request #${orderId} sample is now ${sampleStatus}`,
            entityType: "Order",
            entityId: orderId,
            metadata: { sampleStatus }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: orderId,
            action: "UPDATE_SAMPLE_STATUS_BY_LAB",
            metadata: { sampleStatus }
        });
        res.json({ message: "Updated successfully", order });
    }
    catch (error) {
        next(error);
    }
};
exports.updateOrderSampleStatusByLab = updateOrderSampleStatusByLab;
const deleteOrderByLab = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== domain_1.roles[1]) {
            throw new ApiError_1.ApiError(403, "Forbidden");
        }
        const orderId = Number(req.params.id);
        const existingOrder = await prisma_1.prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
        if (!existingOrder) {
            throw new ApiError_1.ApiError(404, "Order not found");
        }
        await prisma_1.prisma.order.update({ where: { id: orderId }, data: { isDeleted: true, deletedAt: new Date() } });
        (0, socket_1.getSocketServer)().emit("order:updated", { id: orderId, deleted: true });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Order",
            entityId: orderId,
            action: "SOFT_DELETE_BY_LAB"
        });
        res.json({ message: "Deleted successfully", deletedOrderId: orderId });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteOrderByLab = deleteOrderByLab;
