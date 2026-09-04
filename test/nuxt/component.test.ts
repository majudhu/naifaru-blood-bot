import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";

import DefaultLayout from "../../app/layouts/default.vue";

const session = vi.hoisted(() => ({
  clear: vi.fn<() => void>(),
  fetch: vi.fn<() => Promise<void>>(async () => {}),
  loggedIn: {
    __v_isRef: true,
    value: true,
  },
  ready: {
    __v_isRef: true,
    value: true,
  },
  user: {
    __v_isRef: true,
    value: { id: 1, name: "Admin", role: "admin" },
  },
}));

mockNuxtImport("navigateTo", () => vi.fn<() => void>());
mockNuxtImport("useUserSession", () => () => ({
  clear: session.clear,
  fetch: session.fetch,
  loggedIn: session.loggedIn,
  ready: session.ready,
  user: session.user,
}));

beforeEach(() => {
  session.clear.mockReset();
  session.fetch.mockClear();
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(() => true),
    matches: false,
    media: "",
    onchange: null,
    removeEventListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
  }));
});

describe("default layout", () => {
  it("shows Staff navigation for admins", async () => {
    session.user.value = { id: 1, name: "Admin", role: "admin" };

    const component = await mountSuspended(DefaultLayout, {
      slots: { default: "<p>Page content</p>" },
    });

    expect(component.text()).toContain("Dashboard");
    expect(component.text()).toContain("Requests");
    expect(component.text()).toContain("Staff");
    expect(component.text()).toContain("Page content");
  });

  it("hides request and staff navigation from nurses", async () => {
    session.user.value = { id: 2, name: "Nurse", role: "nurse" };

    const component = await mountSuspended(DefaultLayout, {
      slots: { default: "<p>Page content</p>" },
    });

    expect(component.text()).toContain("Dashboard");
    expect(component.text()).not.toContain("Requests");
    expect(component.text()).not.toContain("Staff");
  });

  it("hides request and staff navigation from lab staff", async () => {
    session.user.value = { id: 3, name: "Lab", role: "lab" };

    const component = await mountSuspended(DefaultLayout, {
      slots: { default: "<p>Page content</p>" },
    });

    expect(component.text()).toContain("Dashboard");
    expect(component.text()).not.toContain("Requests");
    expect(component.text()).not.toContain("Staff");
  });
});
