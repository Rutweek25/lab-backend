"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.resendRegistrationOtp = exports.verifyRegistrationOtp = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const domain_1 = require("../types/domain");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const jwt_1 = require("../utils/jwt");
const audit_1 = require("../utils/audit");
const email_1 = require("../utils/email");
const env_1 = require("../config/env");
const OTP_TTL_MS = 10 * 60 * 1000;
const pendingRegistrations = new Map();
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;
const buildOtpEmailText = (name, otp) => {
    return [
        `Hi ${name},`,
        "",
        "Your verification code for Lab Management System is:",
        otp,
        "",
        "This code expires in 10 minutes.",
        "",
        "If you did not request this, you can ignore this email."
    ].join("\n");
};
const register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            throw new ApiError_1.ApiError(400, "All fields are required");
        }
        if (!domain_1.roles.includes(role)) {
            throw new ApiError_1.ApiError(400, "Invalid role");
        }
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            throw new ApiError_1.ApiError(409, "Email already exists");
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const otp = generateOtp();
        pendingRegistrations.set(normalizedEmail, {
            name,
            email: normalizedEmail,
            passwordHash: hashedPassword,
            role,
            otp,
            expiresAt: Date.now() + OTP_TTL_MS
        });
        const emailSent = await (0, email_1.sendOptionalEmail)(normalizedEmail, "Verify your Lab Management account", buildOtpEmailText(name, otp));
        if (!emailSent && env_1.env.NODE_ENV === "production") {
            pendingRegistrations.delete(normalizedEmail);
            throw new ApiError_1.ApiError(500, "SMTP is not configured. Unable to send OTP email.");
        }
        res.status(201).json({
            message: emailSent
                ? "OTP sent to your email. Verify to complete registration."
                : "OTP generated but SMTP is not configured. Use OTP preview in development.",
            email: normalizedEmail,
            ...(env_1.env.NODE_ENV !== "production" ? { otpPreview: otp } : {})
        });
        await (0, audit_1.writeAuditLog)({
            entityType: "Auth",
            action: "REGISTER_OTP_SENT",
            metadata: { email: normalizedEmail, role }
        });
    }
    catch (error) {
        next(error);
    }
};
exports.register = register;
const verifyRegistrationOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedOtp = String(otp || "").trim();
        if (!normalizedEmail || !normalizedOtp) {
            throw new ApiError_1.ApiError(400, "Email and OTP are required");
        }
        const pending = pendingRegistrations.get(normalizedEmail);
        if (!pending) {
            throw new ApiError_1.ApiError(400, "No pending registration found. Please register again.");
        }
        if (Date.now() > pending.expiresAt) {
            pendingRegistrations.delete(normalizedEmail);
            throw new ApiError_1.ApiError(400, "OTP expired. Please request a new one.");
        }
        if (pending.otp !== normalizedOtp) {
            throw new ApiError_1.ApiError(400, "Invalid OTP");
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            pendingRegistrations.delete(normalizedEmail);
            throw new ApiError_1.ApiError(409, "Email already exists");
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                name: pending.name,
                email: pending.email,
                role: pending.role,
                password: pending.passwordHash,
                isActive: false
            }
        });
        pendingRegistrations.delete(normalizedEmail);
        res.status(201).json({
            message: "Email verified successfully. Your account is pending admin approval.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: user.id,
            actorRole: user.role,
            entityType: "User",
            entityId: user.id,
            action: "REGISTER_VERIFIED_PENDING_APPROVAL"
        });
    }
    catch (error) {
        next(error);
    }
};
exports.verifyRegistrationOtp = verifyRegistrationOtp;
const resendRegistrationOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail) {
            throw new ApiError_1.ApiError(400, "Email is required");
        }
        const pending = pendingRegistrations.get(normalizedEmail);
        if (!pending) {
            throw new ApiError_1.ApiError(400, "No pending registration found. Please register again.");
        }
        const otp = generateOtp();
        pendingRegistrations.set(normalizedEmail, {
            ...pending,
            otp,
            expiresAt: Date.now() + OTP_TTL_MS
        });
        const emailSent = await (0, email_1.sendOptionalEmail)(normalizedEmail, "Your new verification code", buildOtpEmailText(pending.name, otp));
        if (!emailSent && env_1.env.NODE_ENV === "production") {
            throw new ApiError_1.ApiError(500, "SMTP is not configured. Unable to send OTP email.");
        }
        res.json({
            message: emailSent
                ? "A new OTP has been sent to your email."
                : "OTP regenerated but SMTP is not configured. Use OTP preview in development.",
            ...(env_1.env.NODE_ENV !== "production" ? { otpPreview: otp } : {})
        });
    }
    catch (error) {
        next(error);
    }
};
exports.resendRegistrationOtp = resendRegistrationOtp;
const login = async (req, res, next) => {
    try {
        const { email, password, role } = req.body;
        if (!email || !password || !role) {
            throw new ApiError_1.ApiError(400, "Email, password and role are required");
        }
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new ApiError_1.ApiError(401, "Invalid credentials");
        }
        if (user.isActive === false) {
            throw new ApiError_1.ApiError(403, "Account not approved by admin yet.");
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword || user.role !== role) {
            throw new ApiError_1.ApiError(401, "Invalid credentials or role");
        }
        const token = (0, jwt_1.signToken)({
            id: user.id,
            role: user.role,
            email: user.email,
            name: user.name
        });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
        await (0, audit_1.writeAuditLog)({
            actorId: user.id,
            actorRole: user.role,
            entityType: "Auth",
            entityId: user.id,
            action: "LOGIN"
        });
    }
    catch (error) {
        next(error);
    }
};
exports.login = login;
