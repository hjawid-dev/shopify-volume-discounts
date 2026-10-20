/* The rules that keep the product page widget in step with checkout.
   Pure functions, so they can be tested without Shopify. */

/** What the widget is given when it should show no offer. */
export const EMPTY_WIDGET_CONFIG = JSON.stringify({offers: []});

export function activeDiscounts(discounts) {
  return discounts.filter((discount) => discount.status === 'ACTIVE');
}

/**
 * The configuration the widget should show: that of the one active volume discount.
 * With none active, or with more than one (which can happen if discounts are activated
 * on Shopify's own discount page), the widget shows nothing rather than a price that
 * checkout might not charge.
 */
export function widgetConfigFor(discounts) {
  const active = activeDiscounts(discounts);
  return active.length === 1 && active[0].rawConfig ? active[0].rawConfig : EMPTY_WIDGET_CONFIG;
}

/** Another active volume discount that has to be paused before this one can be active, or null. */
export function blockingDiscount(discounts, id) {
  return activeDiscounts(discounts).find((discount) => discount.id !== id) ?? null;
}
