import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import AuditLogs from "../../app/pages/audit-logs.vue";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<() => Promise<void>>(),
  useLazyFetch: vi.fn<
    (
      url: string,
      options: {
        query: {
          page: Ref<number>;
          search: Ref<string>;
          action: Ref<string>;
          entity: Ref<string>;
        };
      },
    ) => unknown
  >(),
}));

mockNuxtImport("useLazyFetch", () => mocks.useLazyFetch);

const entry = {
  id: 8,
  actorId: 1,
  actorName: "Admin",
  actorRole: "admin",
  action: "update",
  entityType: "user",
  entityId: 7,
  details: { name: "Aisha", status: "Donor" } as Record<string, unknown>,
  ipAddress: "192.0.2.1",
  createdAt: "2026-10-21T04:00:00.000Z",
};

let component: VueWrapper;
let data: Ref<{ data: (typeof entry)[]; total: number }>;
let error: Ref<Error | null>;

beforeEach(() => {
  vi.clearAllMocks();
  data = ref({ data: [entry], total: 41 });
  error = ref(null);
  mocks.refresh.mockResolvedValue();
  mocks.useLazyFetch.mockReturnValue({ data, error, pending: ref(false), refresh: mocks.refresh });
});

afterEach(() => {
  component?.unmount();
});

describe("admin audit log table", () => {
  it("shows a summary table without a details column", async () => {
    component = await mountSuspended(AuditLogs);
    expect(component.text()).toContain("Admin #1");
    expect(component.text()).toContain("Updated");
    expect(component.text()).toContain("User #7");
    expect(component.text()).toContain("192.0.2.1");
    expect(component.text()).toContain("41 records");
    expect(component.find("time").attributes("datetime")).toBe(entry.createdAt);
    expect(component.find("time").text()).toContain("9:00");
    expect(component.findAll("th").map((header) => header.text())).not.toContain("Details");
    expect(component.text()).not.toContain("Aisha");
    expect(component.findAll("button").map((button) => button.text())).not.toContain("Delete");
    expect(component.findAll("button").map((button) => button.text())).not.toContain("Edit");
  });

  it("opens a read-only details dialog when a row is clicked and allows closing it", async () => {
    component = await mountSuspended(AuditLogs, { attachTo: document.body });
    await component.find("tbody tr").trigger("click");
    await flushPromises();
    const dialog = new DOMWrapper(document.body).find('[role="dialog"]');

    expect(dialog.text()).toContain("Audit details");
    expect(dialog.text()).toContain("Admin #1");
    expect(dialog.text()).toContain("Updated");
    expect(dialog.text()).toContain("User #7");
    expect(dialog.text()).toContain("192.0.2.1");
    expect(dialog.find("pre").text()).toContain('"name": "Aisha"');
    expect(dialog.find("input, textarea").exists()).toBe(false);

    await dialog.find('button[aria-label="Close"]').trigger("click");
    await flushPromises();
    expect(new DOMWrapper(document.body).find('[role="dialog"]').exists()).toBe(false);
  });

  it.each(["Enter", " "])(
    "opens the selected row with %s and handles actions without extra details",
    async (key) => {
      data.value.data.push({ ...entry, id: 9, actorName: "Nurse", details: {} });
      component = await mountSuspended(AuditLogs, { attachTo: document.body });
      await component.findAll("tbody tr")[1]!.trigger("keydown", { key });
      await flushPromises();
      const dialog = new DOMWrapper(document.body).find('[role="dialog"]');

      expect(dialog.text()).toContain("Nurse #1");
      expect(dialog.text()).not.toContain("Admin");
      expect(dialog.text()).toContain("No additional details for this action.");
      expect(dialog.find("pre").exists()).toBe(false);
    },
  );

  it.each(["search", "action", "entity"] as const)(
    "resets pagination when the %s filter changes",
    async (filter) => {
      component = await mountSuspended(AuditLogs);
      const query = mocks.useLazyFetch.mock.calls[0]![1].query;
      query.page.value = 3;
      query[filter].value = { search: "Aisha", action: "update", entity: "user" }[filter];
      await flushPromises();
      expect(query.page.value).toBe(1);
      expect(mocks.useLazyFetch.mock.calls[0]![0]).toBe("/api/audit-logs");
    },
  );

  it("refreshes the log on request", async () => {
    component = await mountSuspended(AuditLogs);
    await component
      .findAll("button")
      .find((button) => button.text() === "Refresh")!
      .trigger("click");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows an empty state", async () => {
    data.value = { data: [], total: 0 };
    component = await mountSuspended(AuditLogs);
    expect(component.text()).toContain("No audit records found.");
    expect(component.text()).toContain("0 records");
  });

  it("shows a load error without displaying stale rows", async () => {
    error.value = new Error("Request failed");
    component = await mountSuspended(AuditLogs);
    expect(component.text()).toContain("Could not load the audit log");
    expect(component.find("table").exists()).toBe(false);
    expect(component.text()).not.toContain("41 records");
  });
});
