import express from "express";

import {
    saveStore,
    getStore,
    getAllStores,
} from "../controllers/storeController.js";

import {
    validateInternalRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
    "/",
    getAllStores
);

router.post(
    "/",
    validateInternalRequest,
    saveStore
);

router.get(
    "/:shop",
    getStore
);

export default router;