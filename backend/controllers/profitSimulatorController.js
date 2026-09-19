import { runProfitSimulation } from "../services/profitSimulatorService.js";

export async function simulateProfit(req, res) {
    try {
        const result = await runProfitSimulation({
            shop: req.verifiedShop,
            ...(req.body || {}),
        });

        return res.status(200).json({ success: true, simulation: result });
    } catch (error) {
        console.error("[MarginMind] Profit Simulator Error:", error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Unable to run profit simulation.",
        });
    }
}