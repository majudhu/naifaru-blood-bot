import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import Reports from "../../app/pages/reports.vue";

const mocks = vi.hoisted(() => ({
  useLazyFetch:
    vi.fn<
      (
        _url: string,
        _options: { query: Ref<{ period: string; start?: string; end?: string }> },
      ) => unknown
    >(),
}));

mockNuxtImport("useUserSession", () => () => ({ user: ref({ role: "admin" }) }));
mockNuxtImport("useLazyFetch", () => mocks.useLazyFetch);

const report = {
  range: { start: null, end: "2026-10-21", interval: "month" },
  total: {
    requests: 7,
    donations: 2,
    donors: 3,
    newDonors: 1,
    responses: 7,
  },
  groups: [
    {
      type: "A+",
      requests: 6,
      donations: 2,
      donors: 2,
      newDonors: 1,
      responses: 5,
    },
    {
      type: "A-",
      requests: 1,
      donations: 0,
      donors: 0,
      newDonors: 0,
      responses: 1,
    },
    {
      type: "O+",
      requests: 0,
      donations: 0,
      donors: 1,
      newDonors: 0,
      responses: 1,
    },
  ],
  trends: [{ date: "2026-10-01", requests: 7, donations: 2, newDonors: 1 }],
};
let component: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useLazyFetch.mockReturnValue({
    data: ref(report),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  });
});
afterEach(() => component?.unmount());

function button(text: string) {
  return component.findAll("button").find((button) => button.text() === text)!;
}

function summaryTable() {
  return component.find('section[aria-labelledby="blood-group-report"] table');
}

describe("reports page", () => {
  it("puts Total first and calculates ratios from counts, including groups with no donors", async () => {
    component = await mountSuspended(Reports);

    expect(
      summaryTable()
        .findAll("thead th")
        .map((cell) => cell.text()),
    ).toEqual(["Summary", "Total", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]);
    const rows = summaryTable().findAll("tbody tr");
    expect(rows[0]!.findAll("td")[0]!.text()).toBe("7");
    expect(rows[3]!.findAll("td")[0]!.text()).toBe("3");
    expect(rows[4]!.findAll("td").map((cell) => cell.text())).toEqual([
      "2.33",
      "3",
      "No donors",
      "—",
      "—",
      "0",
      "—",
      "—",
      "—",
    ]);
    expect(component.text()).toContain("The current donor pool includes all dates.");
    expect(component.findAllComponents({ name: "ReportTrend" })).toHaveLength(3);
  });

  it("shows response totals separately from recorded donations", async () => {
    component = await mountSuspended(Reports);
    const rows = summaryTable().findAll("tbody tr");
    const totalFor = (label: string) =>
      rows
        .find((row) => row.find("th").text() === label)!
        .findAll("td")[0]!
        .text();

    expect(totalFor("Donor response records")).toBe("7");
    expect(totalFor("Donations in period")).toBe("2");
    expect(component.text()).toContain("Response records may be incomplete.");
  });

  it("changes the selected date period without applying it to the donor pool", async () => {
    component = await mountSuspended(Reports);
    await button("Last 30 days").trigger("click");

    expect(mocks.useLazyFetch.mock.calls[0]![1].query.value).toEqual({ period: "1" });
    expect(button("Last 30 days").attributes("aria-pressed")).toBe("true");
    expect(button("All time").attributes("aria-pressed")).toBe("false");
  });

  it("only applies custom dates after submission and rejects reversed ranges", async () => {
    component = await mountSuspended(Reports);
    await button("Custom dates").trigger("click");
    const query = mocks.useLazyFetch.mock.calls[0]![1].query;
    const previous = { ...query.value };
    const inputs = component.findAll('input[type="date"]');
    await inputs[0]!.setValue("2026-01-01");
    await inputs[1]!.setValue("2026-02-01");

    expect(query.value).toEqual(previous);
    await component.find("form").trigger("submit");
    expect(query.value).toEqual({ period: "custom", start: "2026-01-01", end: "2026-02-01" });

    await inputs[0]!.setValue("2026-03-01");
    expect(button("Apply dates").attributes("disabled")).toBeDefined();
    await component.find("form").trigger("submit");
    expect(query.value.start).toBe("2026-01-01");
  });

  it("adds an Unknown column when a record has no blood group", async () => {
    mocks.useLazyFetch.mockReturnValue({
      data: ref({
        ...report,
        groups: [
          ...report.groups,
          { type: "", requests: 1, donations: 0, donors: 0, newDonors: 0, responses: 0 },
        ],
      }),
      pending: ref(false),
      error: ref(null),
    });
    component = await mountSuspended(Reports);

    expect(summaryTable().findAll("thead th").at(-1)!.text()).toBe("Unknown");
  });
});
