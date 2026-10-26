import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, eventHandler, toPlainHandler, useSession } from "h3";
import { SESSION_MAX_AGE } from "../../shared/utils/session";

type Role = keyof typeof SESSION_MAX_AGE;

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionHandler(maxAge: number, role?: Role) {
  return toPlainHandler(
    createApp().use(
      eventHandler(async (event) => {
        const session = await useSession<{ user?: { role: Role } }>(event, {
          name: "test-session",
          password: "test-password-with-at-least-32-characters",
          maxAge,
        });
        if (role) await session.update({ user: { role } });
        return { user: session.data.user ?? null };
      }),
    ),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Role-specific session expiry", () => {
  it.each([
    { role: "admin", days: 4, valid: false },
    { role: "lab", days: 4, valid: false },
    { role: "nurse", days: 4, valid: true },
    { role: "nurse", days: 180, valid: true },
    { role: "nurse", days: 366, valid: false },
  ] as const)("reads $role cookies after $days days: $valid", async ({ role, days, valid }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.UTC(2026, 0, 1);
    vi.setSystemTime(now);

    const issue = sessionHandler(SESSION_MAX_AGE[role], role);
    const response = await issue({ method: "GET", path: "/", headers: {} });
    const cookie = response.headers.find(([name]) => name === "set-cookie")![1];
    expect(cookie).toContain(
      `Expires=${new Date(now + SESSION_MAX_AGE[role] * 1000).toUTCString()}`,
    );

    vi.setSystemTime(now + days * DAY_MS);
    const read = sessionHandler(SESSION_MAX_AGE.nurse);
    const result = await read({
      method: "GET",
      path: "/",
      headers: { cookie: cookie.split(";")[0]! },
    });

    expect(JSON.parse(result.body as string)).toEqual({ user: valid ? { role } : null });
  });
});
