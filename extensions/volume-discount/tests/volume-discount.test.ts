import {describe, test, expect} from 'vitest';
import {cartLinesDiscountsGenerateRun} from '../src/cart_lines_discounts_generate_run';
import {DiscountClass, ProductDiscountSelectionStrategy} from '../generated/api';

const TIERS = JSON.stringify({
  tiers: [
    {quantity: 2, percentage: 10},
    {quantity: 3, percentage: 20},
  ],
});

function buildInput({
  lines,
  discountClasses = [DiscountClass.Product],
  metafieldValue = TIERS,
}: {
  lines: {id: string; quantity: number}[];
  discountClasses?: DiscountClass[];
  metafieldValue?: string | null;
}) {
  return {
    cart: {
      lines: lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        cost: {subtotalAmount: {amount: '0'}},
      })),
    },
    discount: {
      discountClasses,
      metafield: metafieldValue === null ? null : {value: metafieldValue},
    },
  } as any;
}

describe('cartLinesDiscountsGenerateRun', () => {
  test('no operations when the cart is empty', () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({lines: []}));
    expect(result.operations).toEqual([]);
  });

  test('no operations without the product discount class', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 5}], discountClasses: []}),
    );
    expect(result.operations).toEqual([]);
  });

  test('no operations when the config metafield is missing', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 5}], metafieldValue: null}),
    );
    expect(result.operations).toEqual([]);
  });

  test('no operations when quantity is below the lowest tier', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 1}]}),
    );
    expect(result.operations).toEqual([]);
  });

  test('applies the tier percentage to a qualifying line', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 2}]}),
    );

    expect(result.operations).toEqual([
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: 'Volume discount',
              targets: [{cartLine: {id: 'gid://l/1'}}],
              value: {percentage: {value: 10}},
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ]);
  });

  test('picks the highest tier reached', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 4}]}),
    );
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.value).toEqual({percentage: {value: 20}});
  });

  test('one candidate per qualifying line, skips the rest', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        lines: [
          {id: 'gid://l/1', quantity: 3},
          {id: 'gid://l/2', quantity: 1},
          {id: 'gid://l/3', quantity: 2},
        ],
      }),
    );
    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c: {targets: {cartLine: {id: string}}[]}) => c.targets[0].cartLine.id)).toEqual([
      'gid://l/1',
      'gid://l/3',
    ]);
  });

  test('applies a fixed amount when discountType is fixed', () => {
    const fixedConfig = JSON.stringify({
      discountType: 'fixed',
      tiers: [{quantity: 2, value: 50}],
    });
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 2}], metafieldValue: fixedConfig}),
    );
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.value).toEqual({fixedAmount: {amount: '50'}});
  });

  test('reads the offers format written by the admin UI', () => {
    const offersConfig = JSON.stringify({
      discountType: 'percentage',
      cartTitle: 'Bundle & save',
      offers: [
        {quantity: 1, value: 0, title: 'Buy 1'},
        {quantity: 2, value: 10, title: 'Buy 2'},
        {quantity: 3, value: 15, title: 'Buy 3'},
      ],
    });
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 3}], metafieldValue: offersConfig}),
    );
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.value).toEqual({percentage: {value: 15}});
    expect(candidate.message).toBe('Bundle & save');
  });

  test('an offer with no discount does not produce a candidate', () => {
    const offersConfig = JSON.stringify({
      offers: [
        {quantity: 1, value: 0},
        {quantity: 2, value: 10},
      ],
    });
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 1}], metafieldValue: offersConfig}),
    );
    expect(result.operations).toEqual([]);
  });

  test('no operations when the config is not valid JSON', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({lines: [{id: 'gid://l/1', quantity: 5}], metafieldValue: '{not json'}),
    );
    expect(result.operations).toEqual([]);
  });
});
