import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../application/samplePlan";
import { appReducer, createInitialAppState } from "./appReducer";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

describe("appReducer persistence state", () => {
  it("queues a new local save when the user keeps their side of a conflict", () => {
    const plan = { ...createSamplePlan(DEVICE_ID), revision: 2 };
    const remote = { ...createSamplePlan("other-device"), revision: 3 };
    const conflicted = appReducer(createInitialAppState(plan, DEVICE_ID), {
      type: "save-conflicted",
      remote,
    });

    const kept = appReducer(conflicted, { type: "local-kept" });

    expect(kept).toMatchObject({
      plan: { revision: 3 },
      conflictingPlan: null,
      saveStatus: "local-change",
      editSequence: 1,
    });
  });
});
