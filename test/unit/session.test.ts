import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestSession = {
  id: string;
  user?: { id: number; name: string; role: string };
  secure?: { token: string };
};

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn<(...args: unknown[]) => string | undefined>(),
  getUserSession: vi.fn<() => Promise<TestSession>>(),
  replaceUserSession: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
  vi.stubGlobal("getRequestHeader", (event: { accept?: string }) => event.accept);
  vi.stubGlobal("useRuntimeConfig", () => ({ session: { name: "nuxt-session" } }));
  vi.stubGlobal("getCookie", mocks.getCookie);
  vi.stubGlobal("getUserSession", mocks.getUserSession);
  vi.stubGlobal("replaceUserSession", mocks.replaceUserSession);
  mocks.getCookie.mockReturnValue("sealed-session");
  mocks.getUserSession.mockResolvedValue({
    id: "old-session-id",
    user: { id: 1, name: "Admin", role: "admin" },
    secure: { token: "private-data" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function request(event: { path: string; accept?: string }) {
  const { default: middleware } = await import("../../server/middleware/session");
  return middleware(event as never);
}

describe("Rolling sessions", () => {
  it.each([{ path: "/api/users" }, { path: "/", accept: "text/html,application/xhtml+xml" }])(
    "renews an authenticated request to $path and preserves session data",
    async (event) => {
      await request(event);

      expect(mocks.replaceUserSession).toHaveBeenCalledExactlyOnceWith(event, {
        user: { id: 1, name: "Admin", role: "admin" },
        secure: { token: "private-data" },
      });
    },
  );

  it("does not create a session for an anonymous visitor", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    await request({ path: "/login", accept: "text/html" });

    expect(mocks.getUserSession).not.toHaveBeenCalled();
    expect(mocks.replaceUserSession).not.toHaveBeenCalled();
  });

  it("does not renew an expired or unauthenticated session", async () => {
    mocks.getUserSession.mockResolvedValue({ id: "guest-session-id" });
    await request({ path: "/api/users" });

    expect(mocks.replaceUserSession).not.toHaveBeenCalled();
  });

  it("does not read or renew sessions for static assets", async () => {
    await request({ path: "/_nuxt/app.js", accept: "*/*" });

    expect(mocks.getCookie).not.toHaveBeenCalled();
    expect(mocks.getUserSession).not.toHaveBeenCalled();
    expect(mocks.replaceUserSession).not.toHaveBeenCalled();
  });

  it("lets unexpected session failures propagate", async () => {
    const error = new Error("Session storage failed");
    mocks.replaceUserSession.mockRejectedValue(error);

    await expect(request({ path: "/api/users" })).rejects.toBe(error);
  });
});
