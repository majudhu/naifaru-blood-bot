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
    vi.fn<
      (
        _url: string,
        _options?: { query: Record<string, Ref<string | number | boolean>> },
      ) => unknown
    >(),
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
            islands: ["", "Hinnavaru", "Naifaru"],
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

describe("Donor list filters and mobile statuses", () => {
  it("filters by island, including missing islands, and resets pagination", async () => {
    component = await mountSuspended(Dashboard, { attachTo: document.body });
    const query = listQuery();
    expect(query.island!.value).toBeUndefined();

    for (const [label, value] of [
      ["Naifaru", "Naifaru"],
      ["(None)", ""],
      ["All islands", undefined],
    ]) {
      query.page!.value = 3;
      await component.find('[aria-label="Filter by island"]').trigger("click");
      await flushPromises();
      const options = new DOMWrapper(document.body).findAll('[role="option"]');
      expect(options.map((option) => option.text())).toEqual([
        "All islands",
        "(None)",
        "Hinnavaru",
        "Naifaru",
      ]);
      await options.find((option) => option.text() === label)!.trigger("click");
      await flushPromises();
      expect(query.island!.value).toBe(value);
      expect(query.page!.value).toBe(1);
    }
  });

  it("shows unchecked inclusion controls only for donor filters and resets pagination on changes", async () => {
    component = await mountSuspended(Dashboard);
    const query = listQuery();
    expect(query.temporary!.value).toBe(false);
    expect(query.reserved!.value).toBe(false);

    for (const status of ["donors", "ready", "cooldown"]) {
      query.status!.value = status;
      await flushPromises();
      const checkboxes = component.findAllComponents({ name: "UCheckbox" });
      expect(checkboxes.map((checkbox) => checkbox.props("label"))).toEqual([
        "Temporary",
        "Reserved",
      ]);
      for (const [index, flag] of ["temporary", "reserved"].entries()) {
        query.page!.value = 3;
        await checkboxes[index]!.find('[role="checkbox"]').trigger("click");
        expect(query[flag]!.value).toBe(true);
        expect(query.page!.value).toBe(1);
        await checkboxes[index]!.find('[role="checkbox"]').trigger("click");
        expect(query[flag]!.value).toBe(false);
      }
    }

    for (const status of ["Temporary", "Reserved", "non-donors", "pending", "all"]) {
      query.status!.value = status;
      await flushPromises();
      expect(component.findAllComponents({ name: "UCheckbox" })).toHaveLength(0);
    }
  });

  it("places each status emoji beside the blood type on mobile, with an accessible label", async () => {
    const cases = [
      { status: "Donor", daysAgo: 100, emoji: "✅", label: "Donor" },
      { status: "Donor", daysAgo: 10, emoji: "⏳", label: "Donor · ⏳ 80 days" },
      { status: "Temporary", emoji: "🕒", label: "Temporary" },
      {
        status: "Temporary",
        daysAgo: 10,
        emoji: "🕒 ⏳",
        label: "Temporary · ⏳ 80 days",
      },
      { status: "Reserved", emoji: "🔒", label: "Reserved" },
      { status: "Reserved", daysAgo: 10, emoji: "🔒 ⏳", label: "Reserved · ⏳ 80 days" },
      { status: "Non-Donor", daysAgo: 10, emoji: "🚫", label: "Non-Donor" },
      { status: "pending", daysAgo: 10, emoji: "📝", label: "Pending Review" },
    ];
    users.value = {
      data: cases.map(({ status, daysAgo = 100 }, index) => ({
        ...applicant,
        id: index + 1,
        status,
        lastDonatedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      })),
      total: cases.length,
    };
    component = await mountSuspended(Dashboard);

    for (const status of ["donors", "all"]) {
      listQuery().status!.value = status;
      await flushPromises();
      const rows = component.findAll("tbody tr");
      cases.forEach(({ emoji, label }, index) => {
        const cells = rows[index]!.findAll("td");
        const indicator = cells[4]!.find('[role="img"]');
        expect(cells[4]!.text()).toBe(`O+ ${emoji}`);
        expect(indicator.attributes("aria-label")).toBe(label);
        expect(indicator.attributes("title")).toBe(label);
        expect(indicator.classes()).toContain("sm:hidden");
        expect(cells[6]!.classes()).toEqual(expect.arrayContaining(["hidden", "sm:table-cell"]));
        expect(cells[6]!.text()).toBe(label);
      });
    }
  });
});

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
