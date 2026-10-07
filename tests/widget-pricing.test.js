import {createRequire} from 'node:module';
import {describe, test, expect} from 'vitest';

// The widget is a plain browser script. It exposes its pure functions when loaded with require.
const require = createRequire(import.meta.url);
const {tierPrices, formatMoney} = require('../extensions/bundle-widget/assets/volume-bundle.js');

describe('tierPrices', () => {
  test('percentage discount on the full quantity', () => {
    expect(tierPrices(24900, null, 2, 10, 'percentage', 'regular')).toEqual({now: 44820, was: 49800});
  });

  test('rounds to the nearest minor unit', () => {
    // 3 × 99.95 × 0.85 = 254.8725
    expect(tierPrices(9995, null, 3, 15, 'percentage', 'regular').now).toBe(25487);
  });

  test('fixed discount is given in major units and taken off once', () => {
    expect(tierPrices(24900, null, 2, 50, 'fixed', 'regular')).toEqual({now: 44800, was: 49800});
  });

  test('fixed discount never takes the price below zero', () => {
    expect(tierPrices(4000, null, 1, 50, 'fixed', 'regular').now).toBe(0);
  });

  test('no strikethrough when there is no discount and no compare-at price', () => {
    expect(tierPrices(24900, null, 1, 0, 'percentage', 'regular')).toEqual({now: 24900, was: null});
  });

  test('compareAt mode strikes through the compare-at price', () => {
    expect(tierPrices(24900, 29900, 2, 10, 'percentage', 'compareAt')).toEqual({now: 44820, was: 59800});
  });

  test('compareAt mode uses the regular price when the variant has no compare-at price', () => {
    expect(tierPrices(24900, null, 2, 10, 'percentage', 'compareAt').was).toBe(49800);
  });

  test('an undiscounted offer still shows the compare-at price in regular mode', () => {
    expect(tierPrices(24900, 29900, 1, 0, 'percentage', 'regular')).toEqual({now: 24900, was: 29900});
  });

  test('a compare-at price below the selling price gives no strikethrough', () => {
    expect(tierPrices(24900, 19900, 1, 0, 'percentage', 'regular').was).toBeNull();
  });
});

describe('formatMoney', () => {
  test.each([
    ['{{amount}} kr', 44820, '448.20 kr'],
    ['{{amount_no_decimals}} kr', 44820, '448 kr'],
    ['{{amount_with_comma_separator}} kr', 123456, '1.234,56 kr'],
    ['€{{amount_no_decimals_with_comma_separator}}', 123456, '€1.235'],
    ['{{amount_with_space_separator}} kr', 123456, '1 234,56 kr'],
    ['${{amount}}', 123456, '$1,234.56'],
  ])('%s', (format, cents, expected) => {
    expect(formatMoney(cents, format)).toBe(expected);
  });

  test('keeps the surrounding text of the shop format', () => {
    expect(formatMoney(500, '<span class="money">{{amount}} DKK</span>')).toBe('<span class="money">5.00 DKK</span>');
  });
});
