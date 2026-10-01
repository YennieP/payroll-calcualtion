import { describe, expect, it, vi } from "vitest";

import { BrowserDeviceIdentity } from "./BrowserDeviceIdentity";

class MemoryStringStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("BrowserDeviceIdentity", () => {
  it("reuses one stable device ID across instances", () => {
    const storage = new MemoryStringStorage();
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce("device-one")
      .mockReturnValueOnce("device-two");

    expect(new BrowserDeviceIdentity(storage, createId).getOrCreate()).toBe("device-one");
    expect(new BrowserDeviceIdentity(storage, createId).getOrCreate()).toBe("device-one");
    expect(createId).toHaveBeenCalledOnce();
  });

  it("falls back to an in-memory ID when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: vi.fn(),
    };

    expect(new BrowserDeviceIdentity(storage, () => "fallback-device").getOrCreate()).toBe(
      "fallback-device",
    );
  });
});
