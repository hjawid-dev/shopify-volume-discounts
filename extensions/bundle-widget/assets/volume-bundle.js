(function () {
  'use strict';

  function formatMoney(cents, format) {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    var placeholder = /\{\{\s*(\w+)\s*\}\}/;
    function withDelimiters(number, precision, thousands, decimal) {
      precision = precision == null ? 2 : precision;
      thousands = thousands == null ? ',' : thousands;
      decimal = decimal == null ? '.' : decimal;
      if (isNaN(number) || number == null) return '0';
      number = (number / 100).toFixed(precision);
      var parts = number.split('.');
      var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      var cents = parts[1] ? decimal + parts[1] : '';
      return dollars + cents;
    }
    var match = (format || '{{amount}}').match(placeholder);
    var token = match ? match[1] : 'amount';
    var value;
    switch (token) {
      case 'amount': value = withDelimiters(cents, 2); break;
      case 'amount_no_decimals': value = withDelimiters(cents, 0); break;
      case 'amount_with_comma_separator': value = withDelimiters(cents, 2, '.', ','); break;
      case 'amount_no_decimals_with_comma_separator': value = withDelimiters(cents, 0, '.', ','); break;
      case 'amount_with_space_separator': value = withDelimiters(cents, 2, ' ', ','); break;
      case 'amount_no_decimals_with_space_separator': value = withDelimiters(cents, 0, ' ', ''); break;
      case 'amount_with_apostrophe_separator': value = withDelimiters(cents, 2, "'", '.'); break;
      default: value = withDelimiters(cents, 2);
    }
    return format.replace(placeholder, value);
  }

  // Prices for one offer card, in the shop's minor currency unit (cents, öre).
  // `was` is the strikethrough price, or null when the card should not show one.
  function tierPrices(unit, compareUnit, quantity, value, discountType, compareMode) {
    var regular = unit * quantity;
    var now;
    if (discountType === 'fixed') {
      now = Math.max(0, regular - value * 100);
    } else {
      now = Math.round((regular * (100 - value)) / 100);
    }
    // "Was" base: compare-at × quantity in compareAt mode (regular price if the
    // variant has no compare-at price), otherwise regular price × quantity.
    var was = regular;
    if (compareMode === 'compareAt' && compareUnit && compareUnit > 0) {
      was = compareUnit * quantity;
    }
    // If the card would otherwise have no strikethrough (e.g. the single-item offer
    // with no discount) but the product has a compare-at price, compare against that.
    if (was <= now && compareUnit && compareUnit > 0) {
      was = compareUnit * quantity;
    }
    return {now: now, was: was > now ? was : null};
  }

  // The unit tests load the two pure functions above. `module` does not exist in the browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {formatMoney: formatMoney, tierPrices: tierPrices};
    return;
  }

  function currentVariantId(root) {
    var input = document.querySelector(
      'form[action*="/cart/add"] [name="id"], product-form [name="id"], [name="id"][form]'
    );
    if (input && input.value) return input.value;
    // No native buy button on the page – read the selected variant from the URL.
    try {
      var v = new URL(window.location.href).searchParams.get('variant');
      if (v) return v;
    } catch (e) {}
    // Last resort: the widget's own variant (selected or first available).
    if (root) {
      var dv = root.getAttribute('data-variant-id');
      if (dv) return dv;
    }
    var any = document.querySelector('[name="id"]');
    return any ? any.value : null;
  }

  function VolumeBundle(root) {
    this.root = root;
    this.format = root.getAttribute('data-money-format') || '{{amount}}';
    this.discountType = root.getAttribute('data-discount-type') || 'percentage';
    this.compareMode = root.getAttribute('data-compare-mode') || 'regular';
    this.afterAdd = root.getAttribute('data-after-add') || 'cart';
    try {
      this.variants = JSON.parse(root.querySelector('.vb__variants').textContent);
    } catch (e) {
      this.variants = {};
    }
    this.tiers = Array.prototype.slice.call(root.querySelectorAll('.vb__tier'));
    this.atc = root.querySelector('[data-vb-atc]');
    this.sticky = root.querySelector('[data-vb-sticky]');
    this.bind();
    this.refreshPrices();
  }

  VolumeBundle.prototype.selectedTier = function () {
    return this.root.querySelector('.vb__tier.is-selected') || this.tiers[0];
  };

  VolumeBundle.prototype.select = function (tier) {
    this.tiers.forEach(function (t) {
      var on = t === tier;
      t.classList.toggle('is-selected', on);
      var radio = t.querySelector('.vb__radio');
      if (radio) radio.checked = on;
    });
  };

  VolumeBundle.prototype.currentVariant = function () {
    var id = currentVariantId(this.root);
    if (id != null && this.variants[id] != null) return this.variants[id];
    var first = Object.keys(this.variants)[0];
    return first ? this.variants[first] : null;
  };

  VolumeBundle.prototype.refreshPrices = function () {
    var variant = this.currentVariant();
    if (!variant || variant.price == null) return;
    var self = this;
    this.tiers.forEach(function (tier) {
      var qty = parseInt(tier.getAttribute('data-quantity'), 10) || 1;
      var val = parseFloat(tier.getAttribute('data-discount')) || 0;
      var prices = tierPrices(variant.price, variant.compareAt, qty, val, self.discountType, self.compareMode);
      var now = tier.querySelector('[data-vb-now]');
      var was = tier.querySelector('[data-vb-was]');
      if (now) now.textContent = formatMoney(prices.now, self.format);
      if (was) {
        if (prices.was !== null) {
          was.textContent = formatMoney(prices.was, self.format);
          was.removeAttribute('hidden');
        } else {
          was.setAttribute('hidden', '');
        }
      }
    });
  };

  VolumeBundle.prototype.bind = function () {
    var self = this;
    this.tiers.forEach(function (tier) {
      tier.addEventListener('click', function () {
        self.select(tier);
      });
    });
    // Variant switches in the theme fire a change event on the hidden id input.
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'id') self.refreshPrices();
    });
    if (this.atc) {
      this.atc.addEventListener('click', function () {
        self.addToCart();
      });
    }
    var stickyBtn = this.sticky ? this.sticky.querySelector('[data-vb-atc-sticky]') : null;
    if (stickyBtn) {
      stickyBtn.addEventListener('click', function () {
        self.addToCart();
      });
    }
    this.setupSticky();
  };

  VolumeBundle.prototype.setupSticky = function () {
    var sticky = this.sticky;
    var anchor = this.atc;
    if (!sticky || !anchor || !('IntersectionObserver' in window)) return;
    // Show the sticky button only once the main button has scrolled above the viewport.
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting && e.boundingClientRect.top < 0) {
            sticky.removeAttribute('hidden');
          } else {
            sticky.setAttribute('hidden', '');
          }
        });
      },
      {threshold: 0},
    );
    io.observe(anchor);
  };

  VolumeBundle.prototype.addToCart = function () {
    var self = this;
    var tier = this.selectedTier();
    if (!tier) return;
    var qty = parseInt(tier.getAttribute('data-quantity'), 10) || 1;
    var id = currentVariantId(this.root);
    if (id == null) {
      var first = Object.keys(this.variants)[0];
      id = first || null;
    }
    if (id == null) return;

    var btn = this.atc;
    if (btn) btn.setAttribute('aria-busy', 'true');

    // Collect the theme's cart-items sections so the cart can re-render without a reload.
    var sectionIds = [];
    document.querySelectorAll('cart-items-component[data-section-id]').forEach(function (el) {
      var sid = el.getAttribute('data-section-id');
      if (sid && sectionIds.indexOf(sid) === -1) sectionIds.push(sid);
    });

    var body = {items: [{id: Number(id) || id, quantity: qty}]};
    if (sectionIds.length) {
      body.sections = sectionIds.join(',');
      body.sections_url = window.location.pathname;
    }

    fetch('/cart/add.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('cart add failed');
        return res.json();
      })
      .then(function (data) {
        if (btn) btn.removeAttribute('aria-busy');
        if (self.afterAdd === 'checkout') {
          window.location.href = '/checkout';
          return;
        }
        if (self.afterAdd === 'cart') {
          window.location.href = window.routes && window.routes.cart_url ? window.routes.cart_url : '/cart';
          return;
        }
        self.openCartDrawer(data && data.sections);
      })
      .catch(function () {
        if (btn) btn.removeAttribute('aria-busy');
      });
  };

  // Hooks into the theme's cart drawer (Shopify's Horizon theme family): 'cart:update'
  // refreshes cart items and badge, .open() shows the drawer. Other themes fall back to /cart.
  VolumeBundle.prototype.openCartDrawer = function (sections) {
    function dispatchUpdate(resource, sec) {
      document.dispatchEvent(
        new CustomEvent('cart:update', {
          bubbles: true,
          detail: {
            resource: resource,
            sourceId: 'volume-bundle',
            data: {source: 'volume-bundle', sections: sec || {}},
          },
        }),
      );
    }

    dispatchUpdate(null, sections);

    var drawer = document.querySelector('cart-drawer-component');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
    } else {
      window.location.href = window.routes && window.routes.cart_url ? window.routes.cart_url : '/cart';
      return;
    }

    // Refresh the cart count badge in the background, without delaying the drawer.
    fetch('/cart.js', {headers: {Accept: 'application/json'}})
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        dispatchUpdate(cart, null);
      })
      .catch(function () {});
  };

  function init() {
    document.querySelectorAll('volume-bundle').forEach(function (el) {
      if (!el.__vbInit) {
        el.__vbInit = true;
        new VolumeBundle(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
