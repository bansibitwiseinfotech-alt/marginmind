import mongoose from "mongoose";

const profitLeakSchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },

        leakType: {
            type: String,
            enum: [
                "PRODUCT",
                "ORDER",
                "CUSTOMER",
                "DISCOUNT",
                "SHIPPING",
                "REFUND",
                "PAYMENT_FEE",
                "DATA_QUALITY",
            ],
            required: true,
            index: true,
        },

        affectedArea: {
            type: String,
            required: true,
            trim: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        resourceId: {
            type: String,
            default: null,
            index: true,
        },

        resourceType: {
            type: String,
            enum: [
                "Product",
                "ProductVariant",
                "Order",
                "Customer",
                "Discount",
                "ShippingLine",
                "Store",
                "Other",
            ],
            default: "Other",
        },

        resourceName: {
            type: String,
            default: null,
            trim: true,
        },

        profitImpact: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        impactCurrency: {
            type: String,
            required: true,
            default: "USD",
            trim: true,
        },

        impactType: {
            type: String,
            enum: ["ACTUAL", "ESTIMATED", "POTENTIAL", "MISSING_DATA"],
            default: "ACTUAL",
        },

        severity: {
            type: String,
            enum: ["CRITICAL", "WARNING", "INFO"],
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["OPEN", "RESOLVED", "IGNORED"],
            default: "OPEN",
            index: true,
        },

        confidence: {
            type: String,
            enum: ["HIGH", "MEDIUM", "LOW"],
            default: "HIGH",
        },

        detectionRule: {
            type: String,
            required: true,
            trim: true,
        },

        evidence: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        deduplicationKey: {
            type: String,
            required: true,
            trim: true,
        },

        detectedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: "tbl_profit_leaks",
    }
);

// Compound indexes for high-speed filtered queries and multi-tenant isolation
profitLeakSchema.index({ shop: 1, status: 1, detectedAt: -1 });
profitLeakSchema.index({ shop: 1, leakType: 1, status: 1 });
profitLeakSchema.index({ shop: 1, severity: 1, status: 1 });
profitLeakSchema.index({ shop: 1, resourceId: 1 });
profitLeakSchema.index({ shop: 1, deduplicationKey: 1 }, { unique: true });

const ProfitLeak = mongoose.model("ProfitLeak", profitLeakSchema);

export default ProfitLeak;