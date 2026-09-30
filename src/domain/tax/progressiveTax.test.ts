import { describe, expect, it } from "vitest";

import { progressiveTax } from "./progressiveTax";

describe("progressiveTax", () => {
  it("taxes only the income inside each bracket", () => {
    const taxCents = progressiveTax(2_000_000, [
      { upperLimitCents: 1_000_000, rateBasisPoints: 1_000 },
      { upperLimitCents: 3_000_000, rateBasisPoints: 2_000 },
      { upperLimitCents: null, rateBasisPoints: 3_000 },
    ]);

    expect(taxCents).toBe(300_000);
  });

  it("handles exact bracket boundaries without taxing the next bracket", () => {
    expect(
      progressiveTax(1_000_000, [
        { upperLimitCents: 1_000_000, rateBasisPoints: 1_000 },
        { upperLimitCents: null, rateBasisPoints: 2_000 },
      ]),
    ).toBe(100_000);
  });

  it("rejects fractional cents", () => {
    expect(() =>
      progressiveTax(100.5, [{ upperLimitCents: null, rateBasisPoints: 1_000 }]),
    ).toThrow(/integer number of cents/);
  });
});
