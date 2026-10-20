import {describe, test, expect} from 'vitest';
import {
  EMPTY_WIDGET_CONFIG,
  blockingDiscount,
  widgetConfigFor,
} from '../extensions/admin-home/src/widget-config.js';

const discount = (id, status, offers = [{quantity: 2, value: 10}]) => ({
  id,
  title: `Discount ${id}`,
  status,
  rawConfig: JSON.stringify({offers}),
});

describe('widgetConfigFor', () => {
  test('the widget shows the active discount, not the one saved last', () => {
    const active = discount('a', 'ACTIVE', [{quantity: 2, value: 10}]);
    const paused = discount('b', 'EXPIRED', [{quantity: 2, value: 50}]);
    expect(widgetConfigFor([paused, active])).toBe(active.rawConfig);
  });

  test('the widget shows nothing when no volume discount is active', () => {
    expect(widgetConfigFor([discount('a', 'EXPIRED'), discount('b', 'SCHEDULED')])).toBe(EMPTY_WIDGET_CONFIG);
    expect(widgetConfigFor([])).toBe(EMPTY_WIDGET_CONFIG);
  });

  test('the widget shows nothing when two discounts are active, since checkout may apply either', () => {
    expect(widgetConfigFor([discount('a', 'ACTIVE'), discount('b', 'ACTIVE')])).toBe(EMPTY_WIDGET_CONFIG);
  });

  test('an empty configuration is valid JSON with no offers', () => {
    expect(JSON.parse(EMPTY_WIDGET_CONFIG)).toEqual({offers: []});
  });
});

describe('blockingDiscount', () => {
  test('another active discount blocks activating or creating one', () => {
    const active = discount('a', 'ACTIVE');
    expect(blockingDiscount([active, discount('b', 'EXPIRED')], 'b')).toBe(active);
    expect(blockingDiscount([active], null)).toBe(active);
  });

  test('the active discount does not block itself, and paused ones block nothing', () => {
    expect(blockingDiscount([discount('a', 'ACTIVE')], 'a')).toBeNull();
    expect(blockingDiscount([discount('a', 'EXPIRED'), discount('b', 'EXPIRED')], 'b')).toBeNull();
  });
});
