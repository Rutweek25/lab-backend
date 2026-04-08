"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOptionalEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
const transporter = env_1.env.SMTP_HOST && env_1.env.SMTP_PORT && env_1.env.SMTP_USER && env_1.env.SMTP_PASS
    ? nodemailer_1.default.createTransport({
        host: env_1.env.SMTP_HOST,
        port: env_1.env.SMTP_PORT,
        secure: env_1.env.SMTP_PORT === 465,
        auth: {
            user: env_1.env.SMTP_USER,
            pass: env_1.env.SMTP_PASS
        }
    })
    : null;
const sendOptionalEmail = async (to, subject, text) => {
    if (!transporter || !env_1.env.SMTP_FROM) {
        return false;
    }
    await transporter.sendMail({
        from: env_1.env.SMTP_FROM,
        to,
        subject,
        text
    });
    return true;
};
exports.sendOptionalEmail = sendOptionalEmail;
