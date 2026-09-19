async function notifyProfitAlert({
  shop,
  alert,
}) {
  if (!shop || !alert) {
    return {
      sent: false,
      reason: "Missing notification data.",
    };
  }

  // Future integration point:
  // Brevo / SendGrid / Shopify email / existing
  // MarginMind notification provider.

  return {
    sent: false,
    reason: "Notification provider is not configured.",
  };
}

module.exports = {
  notifyProfitAlert,
};