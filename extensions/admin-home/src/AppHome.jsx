import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const API = 'shopify:admin/api/2026-07/graphql.json';
const FN_NS = '$app:volume-discount';
const FN_KEY = 'function-configuration';
const SHOP_NS = 'volume_discounts';
const DEFAULT_CART_TITLE = 'Volume discount';
const DEFAULT_ATC_TEXT = 'Add to cart';
const SHOP_KEY = 'widget_config';

export default async () => {
  render(<App />, document.body);
};

async function adminGraphQL(query, variables) {
  const res = await fetch(API, {method: 'POST', body: JSON.stringify({query, variables})});
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const LOAD = `
  query Load {
    shop {
      id
      currencyCode
      widgetConfig: metafield(namespace: "${SHOP_NS}", key: "${SHOP_KEY}") { id }
    }
    shopifyFunctions(first: 10) { nodes { id apiType } }
    discountNodes(first: 50) {
      nodes {
        id
        configField: metafield(namespace: "${FN_NS}", key: "${FN_KEY}") { id value }
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            status
            appDiscountType { functionId }
          }
        }
      }
    }
  }
`;

const DEFINE = `
  mutation Define($def: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $def) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

const SET_SHOP = `
  mutation SetShop($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message code } }
  }
`;

const CREATE = `
  mutation Create($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;

const UPDATE = `
  mutation Update($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) { userErrors { field message } }
  }
`;

const DELETE = `
  mutation Delete($id: ID!) {
    discountAutomaticDelete(id: $id) { deletedAutomaticDiscountId userErrors { field message } }
  }
`;

const ACTIVATE = `mutation Activate($id: ID!){ discountAutomaticActivate(id:$id){ userErrors{ field message } } }`;
const DEACTIVATE = `mutation Deactivate($id: ID!){ discountAutomaticDeactivate(id:$id){ userErrors{ field message } } }`;

function defaultOffers() {
  return [
    {quantity: 1, value: 0, title: 'Buy 1', subtitle: '1 item', badge: '', preselected: true},
    {quantity: 2, value: 10, title: 'Buy 2', subtitle: '2 items', badge: 'Best value', preselected: false},
    {quantity: 3, value: 15, title: 'Buy 3', subtitle: '3 items', badge: '', preselected: false},
  ];
}

function newEditing() {
  return {
    id: null,
    title: 'Volume discount',
    status: null,
    metafieldId: null,
    discountType: 'percentage',
    compareAtMode: 'regular',
    cartTitle: DEFAULT_CART_TITLE,
    offers: defaultOffers(),
    atcText: DEFAULT_ATC_TEXT,
  };
}

function App() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState();
  const [view, setView] = useState('list');
  const [shopId, setShopId] = useState(null);
  const [currency, setCurrency] = useState('');
  const [functionId, setFunctionId] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [editing, setEditing] = useState(newEditing());

  useEffect(() => {
    load();
  }, []);

  async function ensureDefinition() {
    try {
      await adminGraphQL(DEFINE, {
        def: {
          name: 'Volume discount widget config',
          namespace: SHOP_NS,
          key: SHOP_KEY,
          type: 'json',
          ownerType: 'SHOP',
          access: {storefront: 'PUBLIC_READ'},
        },
      });
    } catch (e) {
      // The definition most likely exists already – ignore.
    }
  }

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      await ensureDefinition();
      const data = await adminGraphQL(LOAD);
      setShopId(data.shop.id);
      setCurrency(data.shop.currencyCode);

      const fn = data.shopifyFunctions.nodes[0];
      if (!fn) throw new Error('No discount function found. Is the latest app version deployed?');
      setFunctionId(fn.id);

      const list = data.discountNodes.nodes
        .filter(
          (n) =>
            n.discount?.__typename === 'DiscountAutomaticApp' &&
            n.discount?.appDiscountType?.functionId === fn.id,
        )
        .map((n) => {
          const cfg = parseConfig(n.configField?.value);
          return {
            id: n.id,
            title: n.discount.title,
            status: n.discount.status,
            metafieldId: n.configField?.id ?? null,
            discountType: cfg.discountType,
            compareAtMode: cfg.compareAtMode,
            cartTitle: cfg.cartTitle || DEFAULT_CART_TITLE,
            offers: cfg.offers.length ? cfg.offers : defaultOffers(),
            atcText: cfg.atcText || DEFAULT_ATC_TEXT,
          };
        });
      setDiscounts(list);
      return list;
    } catch (e) {
      setError(e.message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setEditing(newEditing());
    setError(undefined);
    setView('edit');
  }

  function openEdit(d) {
    setEditing({...d, offers: d.offers.map((o) => ({...o}))});
    setError(undefined);
    setView('edit');
  }

  function patch(p) {
    setEditing((prev) => ({...prev, ...p}));
  }

  function configValue() {
    const cleanOffers = editing.offers.filter((o) => o.quantity > 0);
    return {
      discountType: editing.discountType,
      compareAtMode: editing.compareAtMode,
      cartTitle: (editing.cartTitle || '').trim() || DEFAULT_CART_TITLE,
      offers: cleanOffers,
      atcText: editing.atcText,
    };
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      if (!editing.offers.some((o) => o.quantity > 0)) {
        throw new Error('Add at least one offer with a quantity.');
      }
      const value = JSON.stringify(configValue());

      let savedId = editing.id;
      if (editing.id) {
        const metafield = editing.metafieldId
          ? {id: editing.metafieldId, value}
          : {namespace: FN_NS, key: FN_KEY, type: 'json', value};
        const data = await adminGraphQL(UPDATE, {
          id: editing.id,
          discount: {title: editing.title, metafields: [metafield]},
        });
        throwUserErrors(data.discountAutomaticAppUpdate.userErrors);
      } else {
        const data = await adminGraphQL(CREATE, {
          discount: {
            title: editing.title || 'Volume discount',
            functionId,
            discountClasses: ['PRODUCT'],
            combinesWith: {orderDiscounts: false, productDiscounts: false, shippingDiscounts: false},
            startsAt: new Date().toISOString(),
            metafields: [{namespace: FN_NS, key: FN_KEY, type: 'json', value}],
          },
        });
        throwUserErrors(data.discountAutomaticAppCreate.userErrors);
        savedId = data.discountAutomaticAppCreate.automaticAppDiscount?.discountId;
      }

      // Mirror the saved config to the shop metafield the storefront widget reads.
      const shopResult = await adminGraphQL(SET_SHOP, {
        metafields: [
          {ownerId: shopId, namespace: SHOP_NS, key: SHOP_KEY, type: 'json', value},
        ],
      });
      throwUserErrors(shopResult.metafieldsSet.userErrors);

      await load();
      setView('list');
      shopify.toast?.show?.('Saved');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeDiscount(d) {
    setSaving(true);
    setError(undefined);
    try {
      const data = await adminGraphQL(DELETE, {id: d.id});
      throwUserErrors(data.discountAutomaticDelete.userErrors);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!editing.id) return;
    setSaving(true);
    setError(undefined);
    try {
      const isActive = editing.status === 'ACTIVE';
      const data = await adminGraphQL(isActive ? DEACTIVATE : ACTIVATE, {id: editing.id});
      const result = isActive ? data.discountAutomaticDeactivate : data.discountAutomaticActivate;
      throwUserErrors(result.userErrors);
      const list = await load();
      const fresh = list.find((x) => x.id === editing.id);
      if (fresh) setEditing({...fresh, offers: fresh.offers.map((o) => ({...o}))});
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // --- Offer editing (on editing.offers) ---
  function updateOffer(index, field, val) {
    setEditing((prev) => ({
      ...prev,
      offers: prev.offers.map((o, i) => {
        if (i !== index) return o;
        if (field === 'quantity' || field === 'value') return {...o, [field]: Number(val)};
        return {...o, [field]: val};
      }),
    }));
  }
  function setPreselected(index, value) {
    // Preselected is exclusive: only one offer at a time. It can also be unchecked entirely, in which case the widget falls back to the first offer.
    setEditing((prev) => ({...prev, offers: prev.offers.map((o, i) => ({...o, preselected: i === index ? value : false}))}));
  }
  function addOffer() {
    setEditing((prev) => {
      const last = prev.offers[prev.offers.length - 1];
      const q = (last ? last.quantity : 1) + 1;
      return {...prev, offers: [...prev.offers, {quantity: q, value: 0, title: `Buy ${q}`, subtitle: `${q} items`, badge: '', preselected: false}]};
    });
  }
  function removeOffer(index) {
    setEditing((prev) => ({...prev, offers: prev.offers.filter((_, i) => i !== index)}));
  }

  if (loading) {
    return (
      <s-page heading="Volume discounts">
        <s-section><s-paragraph>Loading…</s-paragraph></s-section>
      </s-page>
    );
  }

  if (view === 'edit') return renderEdit();
  return renderList();

  function renderList() {
    return (
      <s-page heading="Volume discounts">
        <s-button slot="primary-action" variant="primary" onclick={startNew}>Create discount</s-button>
        <s-section>
          <s-stack gap="base">
            {error ? <s-banner tone="critical">{error}</s-banner> : null}
            {discounts.length === 0 ? (
              <s-stack alignItems="center" gap="base">
                <s-heading>No discounts yet</s-heading>
                <s-paragraph>Create your first volume discount.</s-paragraph>
                <s-button variant="primary" onclick={startNew}>Create discount</s-button>
              </s-stack>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Name</s-table-header>
                  <s-table-header>Status</s-table-header>
                  <s-table-header>Type</s-table-header>
                  <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {discounts.map((d) => (
                    <s-table-row key={d.id}>
                      <s-table-cell><s-text weight="bold">{d.title}</s-text></s-table-cell>
                      <s-table-cell>
                        <s-badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {d.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>{d.discountType === 'fixed' ? 'Fixed amount' : 'Percentage'}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          <s-button onclick={() => openEdit(d)}>Edit</s-button>
                          <s-button variant="tertiary" tone="critical" onclick={() => removeDiscount(d)}>Delete</s-button>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  function renderEdit() {
    const isActive = editing.status === 'ACTIVE';
    const isFixed = editing.discountType === 'fixed';
    return (
      <s-page heading={editing.id ? editing.title : 'New discount'}>
        <s-button slot="primary-action" variant="primary" loading={saving ? 'true' : undefined} onclick={save}>Save</s-button>

        <s-section>
          <s-stack gap="base">
            {error ? <s-banner tone="critical">{error}</s-banner> : null}
            <s-button onclick={() => setView('list')}>← Back</s-button>

            <s-text-field label="Name (internal)" value={editing.title} oninput={(e) => patch({title: e.target.value})} />

            {editing.id ? (
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-text weight="bold">Status:</s-text>
                <s-badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Paused'}</s-badge>
                <s-button onclick={toggleStatus} loading={saving ? 'true' : undefined}>{isActive ? 'Pause' : 'Activate'}</s-button>
              </s-stack>
            ) : null}
          </s-stack>
        </s-section>

        <s-section heading="Discount type">
          <s-select label="Type" value={editing.discountType} onchange={(e) => patch({discountType: e.target.value})}>
            <s-option value="percentage">Percentage (%)</s-option>
            <s-option value="fixed">Fixed amount ({currency})</s-option>
          </s-select>
        </s-section>

        <s-section heading="Discount title">
          <s-stack gap="base">
            <s-text-field
              label="Title in cart & checkout"
              value={editing.cartTitle}
              placeholder={DEFAULT_CART_TITLE}
              oninput={(e) => patch({cartTitle: e.target.value})}
            />
            <s-paragraph>
              <s-text>
                The text shown on the discount line in both the cart and checkout. Shopify
                appends the discount amount after the title. Empty = "{DEFAULT_CART_TITLE}".
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Price display">
          <s-stack gap="base">
            <s-select label="Strikethrough price is based on" value={editing.compareAtMode} onchange={(e) => patch({compareAtMode: e.target.value})}>
              <s-option value="regular">Regular price (quantity × price)</s-option>
              <s-option value="compareAt">Compare-at price (quantity × compare-at)</s-option>
            </s-select>
            <s-paragraph>
              <s-text>
                "Compare-at price" shows the product's compare-at price struck through, also on
                the single-item offer. Products without a compare-at price use the regular price.
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Offers">
          <s-stack gap="large">
            {editing.offers.map((offer, index) => (
              <s-box key={index} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                    <s-text weight="bold">Offer {index + 1}</s-text>
                    <s-button variant="tertiary" tone="critical" onclick={() => removeOffer(index)}>Remove</s-button>
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <s-number-field label="Quantity" value={String(offer.quantity)} min={1} oninput={(e) => updateOffer(index, 'quantity', e.target.value)} />
                    <s-number-field
                      label={isFixed ? 'Discount (amount)' : 'Discount'}
                      value={String(offer.value)}
                      min={0}
                      max={isFixed ? undefined : 100}
                      suffix={isFixed ? currency : '%'}
                      oninput={(e) => updateOffer(index, 'value', e.target.value)}
                    />
                  </s-stack>
                  <s-text-field label="Title" value={offer.title} oninput={(e) => updateOffer(index, 'title', e.target.value)} />
                  <s-text-field label="Subtitle" value={offer.subtitle} oninput={(e) => updateOffer(index, 'subtitle', e.target.value)} />
                  <s-text-field label="Badge (empty = none)" value={offer.badge} oninput={(e) => updateOffer(index, 'badge', e.target.value)} />
                  <s-checkbox
                    label="Preselected (selected by default in the widget)"
                    checked={offer.preselected ? true : undefined}
                    onchange={() => setPreselected(index, !offer.preselected)}
                  />
                </s-stack>
              </s-box>
            ))}
            <s-box><s-button onclick={addOffer}>Add offer</s-button></s-box>
          </s-stack>
        </s-section>

        <s-section heading="Add-to-cart button">
          <s-text-field label="Text" value={editing.atcText} oninput={(e) => patch({atcText: e.target.value})} />
        </s-section>

        <s-section heading="Appearance">
          <s-paragraph>
            <s-text>
              Colours, sizes and what happens after add-to-cart are set in the theme editor with
              live preview: Customize → product template → the Volume discount block.
            </s-text>
          </s-paragraph>
        </s-section>

        {editing.id ? (
          <s-section>
            <s-button variant="tertiary" tone="critical" onclick={() => removeDiscount(editing).then(() => setView('list'))}>Delete discount</s-button>
          </s-section>
        ) : null}
      </s-page>
    );
  }
}

function parseConfig(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    const offers = Array.isArray(parsed.offers) ? parsed.offers : [];
    return {
      offers: offers.map((o) => ({
        quantity: Number(o.quantity) || 1,
        value: Number(o.value ?? o.percentage) || 0,
        title: o.title || '',
        subtitle: o.subtitle || '',
        badge: o.badge || '',
        preselected: !!o.preselected,
      })),
      atcText: parsed.atcText || '',
      discountType: parsed.discountType === 'fixed' ? 'fixed' : 'percentage',
      compareAtMode: parsed.compareAtMode === 'compareAt' ? 'compareAt' : 'regular',
      cartTitle: parsed.cartTitle || DEFAULT_CART_TITLE,
    };
  } catch {
    return {offers: [], atcText: '', discountType: 'percentage', compareAtMode: 'regular', cartTitle: DEFAULT_CART_TITLE};
  }
}

function throwUserErrors(userErrors) {
  if (userErrors && userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join(', '));
  }
}
