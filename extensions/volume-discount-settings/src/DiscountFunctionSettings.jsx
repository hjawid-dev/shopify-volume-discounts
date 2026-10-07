import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useMemo, useState} from "preact/hooks";

const NAMESPACE = "$app:volume-discount";
const KEY = "function-configuration";

export default async () => {
  render(<App />, document.body);
};

function parseTiers(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    const tiers = Array.isArray(parsed.tiers) ? parsed.tiers : [];
    return tiers.map((tier) => ({
      quantity: Number(tier.quantity) || 1,
      percentage: Number(tier.percentage) || 0,
    }));
  } catch {
    return [];
  }
}

function App() {
  const {applyMetafieldChange, data, discounts} = shopify;

  const initialTiers = useMemo(
    () => parseTiers(data?.metafields?.find((m) => m.key === KEY)?.value),
    [data?.metafields],
  );

  const [tiers, setTiers] = useState(
    initialTiers.length ? initialTiers : [{quantity: 2, percentage: 10}],
  );
  const [error, setError] = useState();

  const discountClasses = discounts?.discountClasses?.value ?? [];

  const updateTier = (index, field, value) => {
    setTiers((prev) =>
      prev.map((tier, i) =>
        i === index ? {...tier, [field]: Number(value)} : tier,
      ),
    );
  };

  const addTier = () => {
    setTiers((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, {quantity: (last ? last.quantity : 1) + 1, percentage: 0}];
    });
  };

  const removeTier = (index) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    try {
      // Volume discounts are product discounts – make sure the discount has the product class.
      if (!discountClasses.includes("product")) {
        await discounts?.updateDiscountClasses?.(["product"]);
      }
      const cleaned = tiers
        .filter((tier) => tier.quantity > 0 && tier.percentage > 0)
        .sort((a, b) => a.quantity - b.quantity);
      await applyMetafieldChange({
        type: "updateMetafield",
        namespace: NAMESPACE,
        key: KEY,
        value: JSON.stringify({tiers: cleaned}),
        valueType: "json",
      });
      setError(undefined);
    } catch (e) {
      setError("Could not save the tiers. Please try again.");
    }
  };

  const resetForm = () => {
    setTiers(initialTiers.length ? initialTiers : [{quantity: 2, percentage: 10}]);
  };

  return (
    <s-function-settings
      onSubmit={(event) => event.waitUntil?.(save())}
      onReset={resetForm}
    >
      <s-heading>Volume discount tiers</s-heading>
      <s-section>
        <s-stack gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}
          <s-text>
            Buy at least the given quantity of a product to get the discount on that line.
            The highest tier reached applies.
          </s-text>

          {tiers.map((tier, index) => (
            <s-stack key={index} direction="inline" gap="base" alignItems="end">
              <s-number-field
                label="Quantity (at least)"
                value={String(tier.quantity)}
                min={1}
                onChange={(event) =>
                  updateTier(index, "quantity", event.currentTarget.value)
                }
              />
              <s-number-field
                label="Discount"
                value={String(tier.percentage)}
                min={0}
                max={100}
                suffix="%"
                onChange={(event) =>
                  updateTier(index, "percentage", event.currentTarget.value)
                }
              />
              <s-button
                variant="tertiary"
                onClick={() => removeTier(index)}
                accessibilityLabel="Remove tier"
              >
                <s-icon type="x-circle" />
              </s-button>
            </s-stack>
          ))}

          <s-box>
            <s-button onClick={addTier}>Add tier</s-button>
          </s-box>
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}
