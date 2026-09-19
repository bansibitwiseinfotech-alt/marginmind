import mongoose from "mongoose";

const productThresholdSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      trim: true,
    },

    threshold: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const categoryThresholdSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
    },

    threshold: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const profitAlertConfigSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    globalMarginThreshold: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    criticalMarginThreshold: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    productThresholds: {
      type: [productThresholdSchema],
      default: [],
    },

    categoryThresholds: {
      type: [categoryThresholdSchema],
      default: [],
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    lastDetectedAt: {
      type: Date,
      default: null,
    },

    totalMonitoredResources: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "tbl_profit_alert_configs",
  }
);

const ProfitAlertConfig =
  mongoose.models.ProfitAlertConfig ||
  mongoose.model("ProfitAlertConfig", profitAlertConfigSchema);

export default ProfitAlertConfig;