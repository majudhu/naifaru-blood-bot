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
  useLazyFetch: vi.fn<(_url: string, options: { query: { page: Ref<number> } }) => unknown>(),
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
let component: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  data = ref({ data: [donation], total: 1 });
  mocks.deleteDonation.mockResolvedValue(null);
  mocks.refresh.mockResolvedValue();
  mocks.useLazyFetch.mockReturnValue({ data, pending: ref(false), refresh: mocks.refresh });
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
  const button = component.findAll("button").find((item) => item.text() === "Delete")!;
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
    await openConfirmation();
    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(mocks.deleteDonation).toHaveBeenCalledExactlyOnceWith("/api/donations/9", {
      method: "DELETE",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
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
    const page = mocks.useLazyFetch.mock.calls[0]![1].query.page;
    page.value = 2;

    await confirmationButton("Delete donation").trigger("click");
    await flushPromises();

    expect(page.value).toBe(1);
  });
});
