import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        accessToken: {
            type: String,
            required: true,
        },
        refreshToken: {
            type: String,
            default: null,
        },
        expiresAt: {
            type: Date,
            default: null,  
        },
        name: {
            type: String,
            default: "",
            trim: true,
        },
        email: {
            type: String,
            default: "",
            trim: true,
        },
        currency: {
            type: String,
            default: "USD",
            trim: true,
        },
        plan: {
            type: String,
            default: "",
            trim: true,
        },
        country: {
            type: String,
            default: "",
            trim: true,
        },
        city: {
            type: String,
            default: "",
            trim: true,
        },
        scope: {
            type: String,
            default: "",
            trim: true,
        },
        scopes: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        syncStatus: {
            type: String,
            enum: ["idle", "syncing", "success", "failed", "not_started"],
            default: "not_started",
        },
        lastSyncedAt: {
            type: Date,
            default: null,
        },
        lastSyncStartedAt: {
            type: Date,
            default: null,
        },
        lastSyncError: {
            type: String,
            default: "",
        },
        productsSynced: {
            type: Number,
            default: 0,
        },
        installedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

const Store = mongoose.model(
    "Store",
    storeSchema,
    "tbl_stores"
);

export default Store;