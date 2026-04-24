"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceController = void 0;
const Service_1 = require("../models/Service");
const response_1 = require("../views/response");
class ServiceController {
    // Get all active services
    static async getServices(req, res) {
        try {
            const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
            const sortDirection = sort === 'price_desc' ? -1 : 1;
            const shouldSortByPrice = sort === 'price_asc' || sort === 'price_desc';
            if (!shouldSortByPrice) {
                const services = await Service_1.Service.find({ is_active: true }).sort({ created_at: 1 });
                return response_1.ApiResponse.success(res, services, 'Services retrieved successfully');
            }
            // Use database-level sorting for scalability. priceUSD is primary; fallback to legacy price.
            const services = await Service_1.Service.aggregate([
                { $match: { is_active: true } },
                {
                    $addFields: {
                        effective_price: { $ifNull: ['$priceUSD', '$price'] },
                    },
                },
                { $sort: { effective_price: sortDirection, created_at: 1, _id: 1 } },
            ]);
            return response_1.ApiResponse.success(res, services, 'Services retrieved successfully');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    // Get service by ID
    static async getService(req, res) {
        try {
            const { serviceId } = req.params;
            const service = await Service_1.Service.findOne({ _id: serviceId, is_active: true });
            if (!service) {
                return response_1.ApiResponse.notFound(res, 'Service not found');
            }
            return response_1.ApiResponse.success(res, service, 'Service retrieved successfully');
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
}
exports.ServiceController = ServiceController;
