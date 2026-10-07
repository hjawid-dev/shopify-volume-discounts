import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

/**
 * A discount tier: buy at least `quantity` of a cart line and get `value` off that line.
 * `value` is a percentage (discountType 'percentage') or a fixed amount in the shop currency ('fixed').
 */
interface Tier {
  quantity: number;
  value: number;
}

type DiscountType = 'percentage' | 'fixed';

interface Config {
  discountType: DiscountType;
  /** Title shown on the discount line in cart and checkout. */
  cartTitle: string;
  tiers: Tier[];
}

const DEFAULT_CART_TITLE = 'Volume discount';

/**
 * Reads the configuration from the discount's metafield ($app:volume-discount / function-configuration).
 * Supports the current format ({discountType, offers: [{quantity, value}]}) and the
 * legacy one ({tiers: [{quantity, percentage}]}).
 */
function readConfig(value?: string | null): Config {
  const empty: Config = {discountType: 'percentage', cartTitle: DEFAULT_CART_TITLE, tiers: []};
  if (!value) {
    return empty;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(value);
  } catch {
    return empty;
  }

  const discountType: DiscountType =
    parsed.discountType === 'fixed' ? 'fixed' : 'percentage';

  const cartTitle =
    typeof parsed.cartTitle === 'string' && parsed.cartTitle.trim()
      ? parsed.cartTitle.trim()
      : DEFAULT_CART_TITLE;

  const rawTiers =
    Array.isArray(parsed.offers) && parsed.offers.length
      ? parsed.offers
      : Array.isArray(parsed.tiers)
        ? parsed.tiers
        : [];
  const tiers: Tier[] = rawTiers
    .map((tier: any) => ({
      quantity: Number(tier.quantity) || 0,
      value: Number(tier.value ?? tier.percentage) || 0,
    }))
    .filter((tier: Tier) => tier.quantity > 0 && tier.value > 0)
    .sort((a: Tier, b: Tier) => b.quantity - a.quantity);

  return {discountType, cartTitle, tiers};
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return {operations: []};
  }

  // Volume discounts are product discounts – skip if the discount lacks the product class.
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return {operations: []};
  }

  const {discountType, cartTitle, tiers} = readConfig(input.discount.metafield?.value);
  if (!tiers.length) {
    return {operations: []};
  }

  // One candidate per cart line that reaches at least one tier (tiers are sorted high to low).
  const candidates = input.cart.lines.flatMap((line) => {
    const tier = tiers.find((t) => line.quantity >= t.quantity);
    if (!tier) {
      return [];
    }

    const value =
      discountType === 'fixed'
        ? {fixedAmount: {amount: tier.value.toString()}}
        : {percentage: {value: tier.value}};

    // Title only – cart and checkout already render the amount next to it,
    // so including it here would show the discount twice.
    const message = cartTitle;

    return [
      {
        message,
        targets: [{cartLine: {id: line.id}}],
        value,
      },
    ];
  });

  if (!candidates.length) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
