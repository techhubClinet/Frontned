"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const Notification_1 = require("../models/Notification");
const response_1 = require("../views/response");
class NotificationController {
    /** Get all notifications for the current admin (newest first). */
    static async getMine(req, res) {
        try {
            const authReq = req;
            const userId = authReq.user?.userId;
            if (!userId) {
                return response_1.ApiResponse.error(res, 'Not authenticated', 401);
            }
            if (authReq.user?.role !== 'admin') {
                return response_1.ApiResponse.error(res, 'Admin only', 403);
            }
            const list = await Notification_1.Notification.find({ recipient: userId })
                .sort({ created_at: -1 })
                .limit(100);
            const unreadCount = await Notification_1.Notification.countDocuments({ recipient: userId, read: false });
            return response_1.ApiResponse.success(res, { notifications: list, unreadCount }, 'Notifications retrieved');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    /** Get only unread count (for badge). */
    static async getUnreadCount(req, res) {
        try {
            const authReq = req;
            const userId = authReq.user?.userId;
            if (!userId || authReq.user?.role !== 'admin') {
                return response_1.ApiResponse.success(res, { unreadCount: 0 }, 'OK');
            }
            const unreadCount = await Notification_1.Notification.countDocuments({ recipient: userId, read: false });
            return response_1.ApiResponse.success(res, { unreadCount }, 'OK');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    /** Mark one notification as read. */
    static async markRead(req, res) {
        try {
            const authReq = req;
            const userId = authReq.user?.userId;
            const { notificationId } = req.params;
            if (!userId || authReq.user?.role !== 'admin') {
                return response_1.ApiResponse.error(res, 'Admin only', 403);
            }
            const updated = await Notification_1.Notification.findOneAndUpdate({ _id: notificationId, recipient: userId }, { read: true }, { new: true });
            if (!updated)
                return response_1.ApiResponse.notFound(res, 'Notification not found');
            return response_1.ApiResponse.success(res, updated, 'Marked as read');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    /** Mark all notifications as read for the current admin. */
    static async markAllRead(req, res) {
        try {
            const authReq = req;
            const userId = authReq.user?.userId;
            if (!userId || authReq.user?.role !== 'admin') {
                return response_1.ApiResponse.error(res, 'Admin only', 403);
            }
            await Notification_1.Notification.updateMany({ recipient: userId }, { read: true });
            return response_1.ApiResponse.success(res, {}, 'All marked as read');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
}
exports.NotificationController = NotificationController;
