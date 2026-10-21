import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import { FetchError } from "ofetch";

import Donations from "../../app/pages/donations.vue";
import { PER_PAGE } from "../../shared/utils/const";

const mocks = vi.hoisted(() => ({
  addToast: vi.fn<(...args: unknown[]) => void>(),
  deleteDonation: vi.fn<(...args: unknown[]) => Promise<null>>(),
  refresh: vi.fn<() => Promise<void>>(),
  refreshSummary: vi.fn<() => Promise<void>>(),
  useLazyFetch:
    vi.fn<
      (
        _url: string,
        options?: { query: { page?: Ref<number>; type?: Ref<string>; month: Ref<number> } },
      ) => unknown
    >(),
}));

mockNuxtImport("navigateTo", () => vi.fn<() => void>());
mockNuxtImport("useUserSession", () => () => ({
  fetch: async () => {},
  loggedIn: ref(true),
  ready: ref(true),
  user: ref({ id: 1, name: "Admin", role: "admin" }),
}));
mockNuxtImport("useToast", () => () => ({ add: mocks.addToast }));
mockNuxtImport("useLazyFetch", () => mocks.useLazyFetch);

const donation = {
  id: 9,
  bloodType: "A+",
  donatedAt: "2026-09-01T00:00:00.000Z",
  donor: { id: 7, name: "Aisha", phone: "7000000", bloodType: "A+" },
};

let data: Ref<{ data: (typeof donation)[]; total: number }>;
let summary: Ref<{
  total: number;
  last30Days: number;
  last90Days: number;
  last180Days: number;
  last365Days: number;
  groups: { type: string; total: number }[];
}>;
let component: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  data = ref({ data: [donation], total: 1 });
  summary = ref({
    total: 12,
    last30Days: 3,
    last90Days: 6,
    last180Days: 9,
    last365Days: 12,
    groups: [
      { type: "A+", total: 7 },
      { type: "O+", total: 4 },
      { type: "", total: 1 },
    ],
  });
  mocks.deleteDonation.mockResolvedValue(null);
  mocks.refresh.mockResolvedValue();
  mocks.refreshSummary.mockResolvedValue();
  mocks.useLazyFetch.mockImplementation((url) =>
    url === "/api/donations-summary"
      ? { data: summary, pending: ref(false), refresh: mocks.refreshSummary }
      : { data, pending: ref(false), refresh: mocks.refresh },
  );
  vi.stubGlobal("$fetch", mocks.deleteDonation);
});

afterEach(() => {
  component?.unmount();
  vi.unstubAllGlobals();
});

async function openConfirmation() {
  component = await mountSuspended(Donations, {
    attachTo: document.body,
  });
  const button = component.find('button[aria-label="Delete donation"]');
  await button.trigger("click");
  await flushPromises();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
}

function confirmation() {
  return new DOMWrapper(document.body).find('[role="dialog"]');
}

function confirmationButton(label: string) {
  return confirmation()
    .findAll("button")
    .find((item) => item.text() === label)!;
}

describe("donation summary", () => {
  it("shows all blood groups and donations with an unknown group", async () => {
    component = await mountSuspended(Donations);

    expect(component.text()).toContain("A+: 7");
    expect(component.text()).toContain("O+: 4");
    expect(component.text()).toContain("AB-: 0");
    expect(component.text()).toContain("Unknown group: 1");
  });

  it("filters the table by group and resets pagination while keeping other groups visible", async () => {
    component = await mountSuspended(Donations);
    const query = mocks.useLazyFetch.mock.calls[0]![1]!.query;
    query.page!.value = 2;
    const group = component.findAll("button").find((item) => item.text() === "A+: 7")!;

    await group.trigger("click");

    expect(query.type!.value).toBe("A+");
    expect(mocks.useLazyFetch.mock.calls[1]![1]!.query.type!.value).toBe("A+");
    expect(query.page!.value).toBe(1);
    expect(group.attributes("aria-pressed")).toBe("true");
    const groupComponent = component
      .findAllComponents({ name: "UButton" })
      .find((button) => button.text() === "A+: 7")!;
    expect(groupComponent.props("variant")).toBe("solid");
    expect(component.text()).toContain("O+: 4");

    await group.trigger("click");

    expect(query.type!.value).toBe("All");
    expect(mocks.useLazyFetch.mock.calls[1]![1]!.query.type!.value).toBe("All");
    expect(group.attributes("aria-pressed")).toBe("false");
    expect(groupComponent.props("variant")).toBe("subtle");
  });

  it.each([
    ["Total: 12", 0],
    ["Month: 3", 1],
    ["3 Month: 6", 3],
    ["6 Month: 9", 6],
    ["Year: 12", 12],
  ])(
    "applies %s to the list and group counts while preserving other filters",
    async (label, months) => {
      component = await mountSuspended(Donations);
      const listQuery = mocks.useLazyFetch.mock.calls[0]![1]!.query;
      const summaryQuery = mocks.useLazyFetch.mock.calls[1]![1]!.query;
      listQuery.month.value = months === 6 ? 1 : 6;
      listQuery.type!.value = "A+";
      await flushPromises();
      listQuery.page!.value = 2;
      const button = component.findAll("button").find((item) => item.text() === label)!;

      await button.trigger("click");

      expect(listQuery.month.value).toBe(months);
      expect(summaryQuery.month.value).toBe(months);
      expect(summaryQuery.type!.value).toBe("A+");
      expect(listQuery.type!.value).toBe("A+");
      expect(listQuery.page!.value).toBe(1);
      expect(button.attributes("aria-pressed")).toBe("true");
      expect(
        component
          .findAllComponents({ name: "UButton" })
          .find((button) => button.text() === label)!
          .props("variant"),
      ).toBe("solid");
    },
  );
});

describe("donation deletion", () => {
  it("shows the selected donor and date and allows cancelling without deleting", async () => {
    await openConfirmation();

    expect(confirmation().text().replace(/\s+/g, " ")).toContain("Delete donation #9 for Aisha");
    expect(confirmation().find("time").attributes("datetime")).toBe(donation.donatedAt);
    expect(mocks.deleteDonation).not.toHaveBeenCalled();

    await confirmationButton("Cancel").trigger("click");
    await flushPromises();

    expect(confirmation().exists()).toBe(false);
    expect(mocks.deleteDonation).not.toHaveBeenCalled();
  });

  it("deletes the confirmed entry and refreshes the list and count", async () => {
    mocks.refresh.mockImplementation(async () => {
      data.value = { data: [], total: 0 };
    });
    mocks.refreshSummary.mockImplementation(async () => {
      summary.value = {
        total: 0,
        last30Days: 0,
        last90Days: 0,
        last180Days: 0,
        last365Days: 0,
        groups: [],
      };
    });
    await openConfirmation();
    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(mocks.deleteDonation).toHaveBeenCalledExactlyOnceWith("/api/donations/9", {
      method: "DELETE",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.refreshSummary).toHaveBeenCalledOnce();
    expect(component.text()).toContain("A+: 0");
    expect(component.text()).not.toContain("Unknown group:");
    expect(confirmation().exists()).toBe(false);
    expect(component.text()).toContain("0 Donations");
    expect(component.text()).not.toContain("Aisha");
    expect(mocks.addToast).toHaveBeenCalledWith({ title: "Donation deleted", color: "success" });
  });

  it("keeps the confirmation open when deletion fails and lets the admin retry", async () => {
    const error = new FetchError("Request failed");
    error.data = { message: "Donation not found" };
    mocks.deleteDonation.mockRejectedValueOnce(error);
    await openConfirmation();
    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(confirmation().exists()).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.addToast).toHaveBeenCalledWith({
      title: "Could not delete donation",
      description: "Donation not found",
      color: "error",
    });

    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(mocks.deleteDonation).toHaveBeenCalledTimes(2);
    expect(confirmation().exists()).toBe(false);
  });

  it("prevents repeated clicks and closing the dialog while deletion is pending", async () => {
    let completeDeletion!: (value: null) => void;
    mocks.deleteDonation.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          completeDeletion = resolve;
        }),
    );
    await openConfirmation();
    const deleteButton = confirmationButton("Delete donation");
    await deleteButton.trigger("click");

    expect(deleteButton.attributes("disabled")).toBeDefined();
    expect(confirmationButton("Cancel").attributes("disabled")).toBeDefined();
    expect(confirmation().find('button[aria-label="Close"]').exists()).toBe(false);

    await deleteButton.trigger("click");
    expect(mocks.deleteDonation).toHaveBeenCalledOnce();

    completeDeletion(null);
    await flushPromises();

    expect(confirmation().exists()).toBe(false);
  });

  it("returns to the previous page after deleting its last entry", async () => {
    data.value.total = PER_PAGE + 1;
    mocks.refresh.mockImplementation(async () => {
      data.value = { data: [], total: PER_PAGE };
    });
    await openConfirmation();
    const page = mocks.useLazyFetch.mock.calls[0]![1]!.query.page!;
    page.value = 2;

    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(page.value).toBe(1);
  });
});
