import mongoose from "mongoose";

const profitAlertSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    alertType: {
      type: String,
      required: true,
      enum: ["PRODUCT_MARGIN", "CATEGORY_MARGIN", "ORDER_MARGIN", "DISCOUNT_MARGIN"],
      index: true,
    },

    resourceType: {
      type: String,
      enum: ["PRODUCT", "CATEGORY", "ORDER", "DISCOUNT"],
      required: true,
    },

    resourceId: {
      type: String,
      required: true,
      trim: true,
    },

    resourceName: {
      type: String,
      required: true,
      trim: true,
    },

    currentMargin: {
      type: Number,
      required: true,
    },

    threshold: {
      type: Number,
      required: true,
    },

    marginDifference: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"],
      default: "ACTIVE",
      index: true,
    },

    severity: {
      type: String,
      enum: ["WARNING", "CRITICAL"],
      default: "WARNING",
      index: true,
    },

    criticalThreshold: {
      type: Number,
      default: null,
    },

    reason: {
      type: String,
      required: true,
    },

    reasonCode: {
      type: String,
      default: null,
      index: true,
    },

    reasonDetails: {
      type: String,
      default: null,
    },

    primaryDriver: {
      type: String,
      default: null,
    },

    recommendedAction: {
      type: String,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    detectionSource: {
      type: String,
      enum: ["PRODUCT_DATA", "CATEGORY_DATA", "ORDER_DATA", "DISCOUNT_DATA"],
      required: true,
    },

    deduplicationKey: {
      type: String,
      required: true,
      trim: true,
    },

    firstDetectedAt: {
      type: Date,
      default: Date.now,
    },

    lastDetectedAt: {
      type: Date,
      default: Date.now,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    resolutionSource: {
      type: String,
      enum: ["MERCHANT", "AUTOMATIC", "SYSTEM"],
      default: null,
    },

    resolutionNote: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "tbl_profit_alerts",
  }
);

profitAlertSchema.index(
  { shop: 1, deduplicationKey: 1 },
  { unique: true }
);

profitAlertSchema.index({
  shop: 1,
  status: 1,
  lastDetectedAt: -1,
});

profitAlertSchema.index({
  shop: 1,
  alertType: 1,
  resourceId: 1,
});

const ProfitAlert =
  mongoose.models.ProfitAlert ||
  mongoose.model("ProfitAlert", profitAlertSchema);

export default ProfitAlert;