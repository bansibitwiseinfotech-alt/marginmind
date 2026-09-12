import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";

  try {
    const response = await fetch(`${backendUrl}/api/sync/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET,
        "x-shopify-shop-domain": shop,
      },
    });

    if (!response.ok) {
      console.error(`[MarginMind] refunds webhook sync failed for ${shop}: HTTP ${response.status}`);
    } else {
      console.log(`[MarginMind] refunds webhook sync complete for ${shop}`);
    }
  } catch (error) {
    console.error(`[MarginMind] refunds webhook sync error for ${shop}:`, error.message);
  }

  return new Response(null, { status: 200 });
};
