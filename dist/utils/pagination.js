"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPagination = void 0;
const getPagination = (page, pageSize) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(5, Number(pageSize) || 10));
    return {
        page: safePage,
        pageSize: safePageSize,
        skip: (safePage - 1) * safePageSize
    };
};
exports.getPagination = getPagination;
