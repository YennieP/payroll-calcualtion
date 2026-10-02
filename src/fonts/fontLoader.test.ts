import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const response = this.entries.get(this.key(request));
    return response?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(this.key(request), response.clone());
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  private key(request: RequestInfo | URL): string {
    const value = request instanceof Request ? request.url : String(request);
    return new URL(value, globalThis.location.href).href;
  }
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>();

  async open(cacheName: string): Promise<MemoryCache> {
    const existing = this.stores.get(cacheName);
    if (existing) return existing;
    const cache = new MemoryCache();
    this.stores.set(cacheName, cache);
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.stores.delete(cacheName);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const response = await cache.match(request);
      if (response) return response;
    }
    return undefined;
  }
}

const assets = ["sample/font.css", "sample/font.woff2"];

function mockFontResponses(version: string, failWoff2Once = false) {
  let shouldFailWoff2 = failWoff2Once;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.pathname.endsWith("/fonts/asset-manifest.json")) {
      return Response.json({ version, assets });
    }
    if (url.pathname.endsWith("/fonts/sample/font.woff2") && shouldFailWoff2) {
      shouldFailWoff2 = false;
      return new Response("offline", { status: 503 });
    }
    return new Response(url.pathname.endsWith(".css") ? "@font-face {}" : "font-bytes", {
      status: 200,
    });
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("font offline cache", () => {
  it("publishes a content-version cache only after every asset is complete", async () => {
    const storage = new MemoryCacheStorage();
    await storage.open("worthwhile-fonts-old-version");
    vi.stubGlobal("caches", storage as unknown as CacheStorage);
    const loader = await import("./fontLoader");
    const version = loader.getFontLibraryState().version;
    const fetchMock = mockFontResponses(version);
    vi.stubGlobal("fetch", fetchMock);

    await loader.cacheAllFontAssets();

    const cacheName = `worthwhile-fonts-${version}`;
    const cache = storage.stores.get(cacheName);
    expect(cache).toBeDefined();
    expect(storage.stores.has("worthwhile-fonts-old-version")).toBe(false);
    expect(
      [...(cache?.entries.keys() ?? [])].some((url) =>
        url.endsWith(`/fonts/.cache-complete-${version}`),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(([input]) =>
        new URL(String(input), location.href).searchParams.has("font-version"),
      ),
    ).toBe(true);
  });

  it("keeps the old complete cache after failure and retries the partial new cache", async () => {
    const storage = new MemoryCacheStorage();
    await storage.open("worthwhile-fonts-previous-complete");
    vi.stubGlobal("caches", storage as unknown as CacheStorage);
    const loader = await import("./fontLoader");
    const version = loader.getFontLibraryState().version;
    const fetchMock = mockFontResponses(version, true);
    vi.stubGlobal("fetch", fetchMock);

    await expect(loader.retryFontWarmup()).rejects.toThrow("Failed to warm sample/font.woff2");
    expect(loader.getFontLibraryState().status).toBe("error");
    expect(storage.stores.has("worthwhile-fonts-previous-complete")).toBe(true);
    const currentCache = storage.stores.get(`worthwhile-fonts-${version}`);
    expect(
      [...(currentCache?.entries.keys() ?? [])].some((url) => url.includes(".cache-complete-")),
    ).toBe(false);

    await expect(loader.retryFontWarmup()).resolves.toBeUndefined();
    expect(loader.getFontLibraryState().status).toBe("ready");
    expect(storage.stores.has("worthwhile-fonts-previous-complete")).toBe(false);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("font.css")),
    ).toHaveLength(1);
  });
});
