import type { DeviceIdentity } from "../../ports/DeviceIdentity";

const DEFAULT_STORAGE_KEY = "worthwhile-device-id";

interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class BrowserDeviceIdentity implements DeviceIdentity {
  constructor(
    private readonly storage: StringStorage,
    private readonly createId: () => string,
    private readonly storageKey = DEFAULT_STORAGE_KEY,
  ) {}

  getOrCreate(): string {
    try {
      const existing = this.storage.getItem(this.storageKey);
      if (existing) return existing;
      const created = this.createId();
      this.storage.setItem(this.storageKey, created);
      return created;
    } catch {
      return this.createId();
    }
  }
}
