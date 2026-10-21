import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";

import Requests from "../../app/pages/requests.vue";

const mocks = vi.hoisted(() => ({
  useLazyFetch: vi.fn<(_url: string, _options: { query: Record<string, Ref> }) => unknown>(),
  api: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refreshList: vi.fn<() => Promise<void>>(async () => {}),
  refreshSummary: vi.fn<() => Promise<void>>(async () => {}),
}));

mockNuxtImport("useUserSession", () => () => ({
  user: ref({ id: 1, name: "Admin", role: "admin" }),
}));
mockNuxtImport("useToast", () => () => ({ add: vi.fn<() => void>() }));
mockNuxtImport("useLazyFetch", () => mocks.useLazyFetch);

let component: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({ id: 1 });
  vi.stubGlobal("$fetch", mocks.api);
  mocks.useLazyFetch.mockImplementation((url) => ({
    data: ref(
      url === "/api/requests"
        ? { data: [], total: 0 }
        : {
            total: 12,
            month: 1,
            month3: 3,
            month6: 6,
            year: 12,
            groups: [{ type: "A+", total: 7 }],
          },
    ),
    pending: ref(false),
    refresh: url === "/api/requests" ? mocks.refreshList : mocks.refreshSummary,
  }));
});

afterEach(() => {
  component?.unmount();
  vi.unstubAllGlobals();
});

function query(url: string) {
  return mocks.useLazyFetch.mock.calls.find(([path]) => path === url)![1].query;
}

function button(label: string) {
  return component.findAllComponents({ name: "UButton" }).find((item) => item.text() === label)!;
}

describe("request filters", () => {
  it("refreshes the list and summary counts after saving a request", async () => {
    component = await mountSuspended(Requests, { attachTo: document.body });
    await button("Add Request").trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());

    const dialog = new DOMWrapper(document.body).find('[role="dialog"]');
    await dialog.find("form").trigger("submit");

    await vi.waitFor(() => expect(mocks.refreshSummary).toHaveBeenCalledOnce());
    expect(mocks.refreshList).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith("/api/requests", {
      method: "POST",
      body: expect.objectContaining({ unitsNeeded: 1, status: "open" }),
    });
  });

  it.each([
    ["Total: 12", 0],
    ["Month: 1", 1],
    ["3 Month: 3", 3],
    ["6 Month: 6", 6],
    ["Year: 12", 12],
  ])("highlights %s and applies its period to the list and summary", async (label, months) => {
    component = await mountSuspended(Requests);
    const list = query("/api/requests");
    list.month!.value = months === 6 ? 1 : 6;
    list.type!.value = "A+";
    await flushPromises();
    list.page!.value = 2;

    await button(label).trigger("click");

    expect(list.month!.value).toBe(months);
    expect(query("/api/requests-summary").month!.value).toBe(months);
    expect(list.type!.value).toBe("A+");
    expect(query("/api/requests-summary").type!.value).toBe("A+");
    expect(list.page!.value).toBe(1);
    expect(button(label).props("variant")).toBe("solid");
    expect(button(label).attributes("aria-pressed")).toBe("true");
    const inactive = label === "Total: 12" ? "Month: 1" : "Total: 12";
    expect(button(inactive).props("variant")).toBe("subtle");
    expect(button(inactive).attributes("aria-pressed")).toBe("false");
  });

  it("highlights the selected blood group and clears it when clicked again", async () => {
    component = await mountSuspended(Requests);
    const group = button("A+: 7");

    await group.trigger("click");

    expect(query("/api/requests").type!.value).toBe("A+");
    expect(query("/api/requests-summary").type!.value).toBe("A+");
    expect(group.props("variant")).toBe("solid");
    expect(group.attributes("aria-pressed")).toBe("true");

    await group.trigger("click");

    expect(query("/api/requests").type!.value).toBe("All");
    expect(query("/api/requests-summary").type!.value).toBe("All");
    expect(group.props("variant")).toBe("subtle");
    expect(group.attributes("aria-pressed")).toBe("false");
  });
});
