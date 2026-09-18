import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectMongoDB from "./config/mongodb.js";
import storeRoutes from "./routes/storeRoutes.js";
import productProfitabilityRoutes from "./routes/productProfitabilityRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import costRoutes from "./routes/costRoutes.js";
import orderProfitabilityRoutes from "./routes/orderProfitabilityRoutes.js";
import customerProfitabilityRoutes from "./routes/customerProfitabilityRoutes.js";
import discountImpactRoutes from "./routes/discountImpact.routes.js";
import shippingCostRoutes from "./routes/shippingCost.routes.js";
import profitLeakRoutes from "./routes/profitLeakRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must load env before anything that reads env vars
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "MarginMind backend is running",
    });
});
       
app.use(
    "/api/product-profitability",
    productProfitabilityRoutes
);
app.use(
    "/api/order-profitability",
    orderProfitabilityRoutes
);
app.use(
    "/api/customer-profitability",
    customerProfitabilityRoutes
);
app.use("/api/shipping-cost", shippingCostRoutes);
app.use("/api/discount-impact", discountImpactRoutes);
app.use("/api/profit-leaks", profitLeakRoutes);
// ---------------------------------------------------------------------------
// Cost management routes
// ---------------------------------------------------------------------------
app.use("/api/costs", costRoutes);

// ---------------------------------------------------------------------------
// Sync routes
// ---------------------------------------------------------------------------
app.use("/api/sync", syncRoutes);

// ---------------------------------------------------------------------------
// Store routes
// ---------------------------------------------------------------------------
app.use("/api/stores", storeRoutes);
// ---------------------------------------------------------------------------
// 404 catch-all for undefined routes
// ---------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// ---------------------------------------------------------------------------
// Connect to MongoDB, then start the server
// ---------------------------------------------------------------------------
await connectMongoDB();

const PORT = process.env.BACKEND_PORT || 5000;

app.listen(PORT, () => {
    console.log(`MongoDB connected`);
    console.log(`MarginMind backend running on port ${PORT}`);
});