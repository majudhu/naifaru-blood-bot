import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";

import Dashboard from "../../app/pages/index.vue";

const mocks = vi.hoisted(() => ({
  toast: vi.fn<(toast: Record<string, unknown>) => void>(),
  api: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refreshUsers: vi.fn<() => Promise<void>>(async () => {}),
  refreshDashboard: vi.fn<() => Promise<void>>(async () => {}),
  useLazyFetch:
    vi.fn<(_url: string, _options?: { query: Record<string, Ref<string | number>> }) => unknown>(),
  session: { __v_isRef: true, value: { id: 1, name: "Admin", role: "admin" } },
}));

mockNuxtImport("useUserSession", () => () => ({
  user: mocks.session,
  fetch: async () => {},
  loggedIn: ref(true),
  ready: ref(true),
}));
mockNuxtImport("useToast", () => () => ({ add: mocks.toast }));
mockNuxtImport("useLazyFetch", () => mocks.useLazyFetch);

const applicant = {
  id: 7,
  name: "Aisha Rasheed",
  phone: "7771234",
  bloodType: "O+",
  nid: "A123456",
  sex: "f",
  address: "Harbour Road",
  status: "pending",
  telegramUserId: 12345,
  telegramUsername: "aisha",
  dob: "0000-01-01T00:00:00.000Z",
  island: "",
  lastDonatedAt: "0000-01-01T00:00:00.000Z",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

let component: VueWrapper;
let users: Ref<{ data: (typeof applicant)[]; total: number }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.value.role = "admin";
  users = ref({ data: [applicant], total: 1 });
  mocks.refreshUsers.mockResolvedValue();
  mocks.refreshDashboard.mockResolvedValue();
  mocks.api.mockImplementation(async (_url, options) => (options ? null : applicant));
  mocks.useLazyFetch.mockImplementation((url) => ({
    data:
      url === "/api/users"
        ? users
        : ref({
            donors: 30,
            new: 5,
            ready: 18,
            groups: [],
            activeRequests: 2,
            pending: 1,
            donations: 80,
            donationsLast30Days: 6,
          }),
    pending: ref(false),
    refresh: url === "/api/users" ? mocks.refreshUsers : mocks.refreshDashboard,
  }));
  vi.stubGlobal("$fetch", mocks.api);
});

afterEach(() => {
  component?.unmount();
  vi.unstubAllGlobals();
});

function listQuery() {
  return mocks.useLazyFetch.mock.calls.find(([url]) => url === "/api/users")![1]!.query;
}

function pendingCard() {
  return component
    .findAll("button")
    .find((button) => button.text().includes("New Donors Pending Review"))!;
}

function dialog() {
  return new DOMWrapper(document.body).find('[role="dialog"]');
}

async function openApplicant() {
  component = await mountSuspended(Dashboard, { attachTo: document.body });
  await pendingCard().trigger("click");
  await component.find("tbody tr").trigger("click");
  await flushPromises();
  await vi.waitFor(() => expect(dialog().exists()).toBe(true));
}

describe("Pending donor review dashboard", () => {
  it("shows the six ordered cards and clears filters when opening pending registrations", async () => {
    component = await mountSuspended(Dashboard);
    const descriptions = component
      .findAll(".grid > *")
      .slice(0, 6)
      .map((card) => card.text());
    expect(descriptions).toEqual([
      "2Active Requests",
      "30Total Donors",
      "5New in the last 30 days",
      "1New Donors Pending Review",
      "80Total Donations",
      "6Donations in the last 30 days",
    ]);
    expect(component.text()).not.toContain("Priority Requests");
    const query = listQuery();
    query.page!.value = 3;
    query.type!.value = "A+";
    query.sex!.value = "m";
    await component.find('input[placeholder="Search"]').setValue("Other donor");
    await vi.waitFor(() => expect(query.search!.value).toBe("Other donor"));
    await pendingCard().trigger("click");
    await vi.waitFor(() => expect(query.search!.value).toBe(""));
    expect(query.status!.value).toBe("pending");
    expect(query.page!.value).toBe(1);
    expect(query.type!.value).toBe("All");
    expect(query.sex!.value).toBe("all");
  });

  it("expands pending details and places the instruction before Phone", async () => {
    await openApplicant();
    const text = dialog().text().replace(/\s+/g, " ");
    expect(text).toContain("Contact the applicant and verify their details.");
    expect(text).toContain("Sex");
    expect(text).toContain("ID: 7");
    expect(text).toContain("TGID: 12345");
    expect(dialog().find("input[readonly]").exists()).toBe(false);
    expect(text).toContain("Hide Details");
    expect(text.indexOf("Status")).toBeLessThan(text.indexOf("Contact the applicant"));
    expect(text.indexOf("Contact the applicant")).toBeLessThan(text.indexOf("Phone"));
    expect(text).not.toContain("Approve registration");
    expect(text).not.toContain("Reject registration");
  });

  it("shows the summary and timestamps without user IDs when details are hidden", async () => {
    mocks.api.mockResolvedValue({
      ...applicant,
      dob: "1990-01-01T00:00:00.000Z",
      island: "Naifaru",
      notes: "Contact after work",
    });
    await openApplicant();
    const hide = dialog()
      .findAll("button")
      .find((button) => button.text() === "Hide Details")!;
    await hide.trigger("click");
    await flushPromises();
    const text = dialog().text().replace(/\s+/g, " ");
    expect(text).toContain(
      "Sex: Female • DoB: 1990-01-01 • Island: Naifaru • TG: aisha • Notes: Contact af...",
    );
    const summary = dialog()
      .findAll("small")
      .find((small) => small.text().replace(/\s+/g, " ").includes("Sex: Female"))!;
    expect(summary.text()).toContain("Created:");
    expect(summary.text()).toContain("Updated:");
    expect(text).not.toContain("ID: 7");
    expect(text).not.toContain("TGID: 12345");
  });

  it.each(["Donor", "Reserved", "Temporary", "Non-Donor"])(
    "saves %s and refreshes both counts and the pending list",
    async (selectedStatus) => {
      await openApplicant();
      const status = component
        .findAllComponents({ name: "UFormField" })
        .find((field) => field.props("name") === "status")!
        .findComponent({ name: "USelect" });
      expect(status.props("items")).toEqual([
        { value: "Donor", label: "Donor" },
        { value: "Temporary", label: "Temporary" },
        { value: "Reserved", label: "Reserved" },
        { value: "Non-Donor", label: "Non-Donor" },
        { value: "pending", label: "Pending Review" },
      ]);
      status.vm.$emit("update:modelValue", selectedStatus);
      await flushPromises();
      mocks.refreshUsers.mockImplementation(async () => {
        users.value = { data: [], total: 0 };
      });
      await dialog().find("form").trigger("submit");
      await vi.waitFor(() => expect(mocks.refreshDashboard).toHaveBeenCalledOnce());
      expect(mocks.api).toHaveBeenCalledWith("/api/users/7", {
        method: "PUT",
        body: expect.objectContaining({ status: selectedStatus, expectedStatus: "pending" }),
      });
      expect(mocks.refreshUsers).toHaveBeenCalledOnce();
      expect(listQuery().status!.value).toBe("pending");
      expect(dialog().exists()).toBe(false);
    },
  );

  it.each(["nurse", "lab"])("shows pending users read-only to %s staff", async (role) => {
    mocks.session.value.role = role;
    await openApplicant();
    expect(dialog().text()).toContain("View User");
    expect(dialog().find('button[type="submit"]').exists()).toBe(false);
    expect(dialog().text()).not.toContain("Contact the applicant and verify their details.");
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/api/users/7");
  });
});
