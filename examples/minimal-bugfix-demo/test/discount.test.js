import test from "node:test";
import assert from "node:assert/strict";

import { calculateDiscountedTotal } from "../src/discount.js";

test("zero quantity should total zero instead of one unit price", () => {
  assert.equal(calculateDiscountedTotal(0, 25, 10), 0);
});

test("non-zero quantity still applies percentage discount", () => {
  assert.equal(calculateDiscountedTotal(2, 25, 10), 45);
});
