"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePatient = exports.deletePatient = exports.listPatients = exports.createPatient = void 0;
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const pagination_1 = require("../utils/pagination");
const audit_1 = require("../utils/audit");
const createPatient = async (req, res, next) => {
    try {
        const { name, phone, age, gender } = req.body;
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const normalizedPhone = String(phone || "").trim();
        const parsedAge = Number(age);
        if (!name || !normalizedPhone || !age || !gender) {
            throw new ApiError_1.ApiError(400, "All fields are required");
        }
        if (!/^\d{10}$/.test(normalizedPhone)) {
            throw new ApiError_1.ApiError(400, "Phone number must be exactly 10 digits");
        }
        if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
            throw new ApiError_1.ApiError(400, "Age must be a valid numeric value");
        }
        const patient = await prisma_1.prisma.patient.create({
            data: {
                name,
                phone: normalizedPhone,
                age: parsedAge,
                gender,
                createdById: req.user.id
            }
        });
        res.status(201).json(patient);
    }
    catch (error) {
        next(error);
    }
};
exports.createPatient = createPatient;
const listPatients = async (req, res, next) => {
    try {
        const { search, page, pageSize } = req.query;
        const { skip, page: currentPage, pageSize: perPage } = (0, pagination_1.getPagination)(page, pageSize);
        const where = search
            ? {
                isDeleted: false,
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } }
                ]
            }
            : { isDeleted: false };
        const [patients, total] = await Promise.all([
            prisma_1.prisma.patient.findMany({
                where,
                include: { createdBy: { select: { id: true, name: true, role: true } } },
                orderBy: { createdAt: "desc" },
                skip,
                take: perPage
            }),
            prisma_1.prisma.patient.count({ where })
        ]);
        res.json({
            data: patients,
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
exports.listPatients = listPatients;
const deletePatient = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const patientId = Number(req.params.id);
        const patient = await prisma_1.prisma.patient.findFirst({ where: { id: patientId, isDeleted: false } });
        if (!patient) {
            throw new ApiError_1.ApiError(404, "Patient not found");
        }
        const orderCount = await prisma_1.prisma.order.count({ where: { patientId, isDeleted: false } });
        if (orderCount > 0) {
            throw new ApiError_1.ApiError(409, "Cannot delete patient with existing requests");
        }
        await prisma_1.prisma.patient.update({
            where: { id: patientId },
            data: { isDeleted: true, deletedAt: new Date() }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Patient",
            entityId: patientId,
            action: "SOFT_DELETE"
        });
        const patients = await prisma_1.prisma.patient.findMany({
            where: req.user.role === "DOCTOR" ? { createdById: req.user.id, isDeleted: false } : { isDeleted: false },
            orderBy: { createdAt: "desc" }
        });
        res.json({
            message: "Patient deleted successfully",
            deletedPatientId: patientId,
            patients
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deletePatient = deletePatient;
const updatePatient = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Unauthorized");
        }
        const patientId = Number(req.params.id);
        const { name, phone, age, gender } = req.body;
        const patient = await prisma_1.prisma.patient.findFirst({ where: { id: patientId, isDeleted: false } });
        if (!patient) {
            throw new ApiError_1.ApiError(404, "Patient not found");
        }
        if (req.user.role === "DOCTOR" && patient.createdById !== req.user.id) {
            throw new ApiError_1.ApiError(403, "You are not allowed to update this patient");
        }
        const normalizedName = String(name || "").trim();
        const normalizedPhone = String(phone || "").trim();
        const normalizedGender = String(gender || "").trim();
        const parsedAge = Number(age);
        if (!normalizedName || !normalizedPhone || !normalizedGender || !parsedAge) {
            throw new ApiError_1.ApiError(400, "All fields are required");
        }
        if (!/^\d{10}$/.test(normalizedPhone)) {
            throw new ApiError_1.ApiError(400, "Phone number must be exactly 10 digits");
        }
        if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
            throw new ApiError_1.ApiError(400, "Age must be a valid numeric value");
        }
        const updatedPatient = await prisma_1.prisma.patient.update({
            where: { id: patientId },
            data: {
                name: normalizedName,
                phone: normalizedPhone,
                age: parsedAge,
                gender: normalizedGender
            }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: req.user.id,
            actorRole: req.user.role,
            entityType: "Patient",
            entityId: patientId,
            action: "UPDATE",
            metadata: {
                name: updatedPatient.name,
                phone: updatedPatient.phone,
                age: updatedPatient.age,
                gender: updatedPatient.gender
            }
        });
        const patients = await prisma_1.prisma.patient.findMany({
            where: req.user.role === "DOCTOR" ? { createdById: req.user.id, isDeleted: false } : { isDeleted: false },
            orderBy: { createdAt: "desc" }
        });
        res.json({
            message: "Patient updated successfully",
            patient: updatedPatient,
            patients
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updatePatient = updatePatient;
