<script setup lang="ts">
import { bloodTypeValues, DAY_MS, SUMMARY_PERIODS } from "~~/shared/utils/const";

const { user } = useUserSession();
if (user.value?.role !== "admin") navigateTo("/");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Maldives" }).format(new Date());
const defaultStart = new Date(new Date(`${today}T00:00:00Z`).getTime() - 29 * DAY_MS)
  .toISOString()
  .slice(0, 10);
const period = ref("0");
const customStart = ref(defaultStart);
const customEnd = ref(today);
const customRange = ref({ start: defaultStart, end: today });
const query = computed(() =>
  period.value === "custom" ? { period: "custom", ...customRange.value } : { period: period.value },
);
const validRange = computed(() =>
  Boolean(
    customStart.value &&
    customEnd.value &&
    customStart.value <= customEnd.value &&
    customEnd.value <= today,
  ),
);
const { data, pending, error, refresh } = await useLazyFetch("/api/reports", { query });

const periods = [
  ...SUMMARY_PERIODS.map((period) => ({
    value: String(period.months),
    label: period.days ? `Last ${period.days} days` : "All time",
  })),
  { value: "custom", label: "Custom dates" },
];
const empty = {
  requests: 0,
  donations: 0,
  newDonors: 0,
  donors: 0,
  responses: 0,
};
const total = computed(() => data.value?.total ?? empty);
const groups = computed(() => [
  { label: "Total", values: total.value },
  ...bloodTypeValues.filter(Boolean).map((type) => ({
    label: type,
    values: data.value?.groups.find((group) => group.type === type) ?? empty,
  })),
  ...(data.value?.groups.some((group) => group.type === "")
    ? [{ label: "Unknown", values: data.value.groups.find((group) => group.type === "")! }]
    : []),
]);
const metrics = [
  { key: "requests", label: "Requests", color: "primary" },
  { key: "donations", label: "Donations", color: "success" },
  { key: "newDonors", label: "New donors", color: "info" },
] as const;
const rows = [
  { key: "requests", label: "Requests in period" },
  { key: "donations", label: "Donations in period" },
  { key: "newDonors", label: "New donors in period" },
  { key: "donors", label: "Current donor pool" },
  { key: "ratio", label: "Requests per donor" },
  { key: "responses", label: "Donor response records" },
] as const;
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const intervalLabel = computed(() => (data.value?.range.interval === "week" ? "week" : "month"));
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Indian/Maldives",
  }).format(new Date(`${date}T00:00:00+05:00`));
const trendLabel = (date: string) =>
  data.value?.range.interval === "week"
    ? `Week of ${dateLabel(date)}`
    : new Intl.DateTimeFormat("en", {
        month: "short",
        year: "numeric",
        timeZone: "Indian/Maldives",
      }).format(new Date(`${date}T00:00:00+05:00`));
const rangeLabel = computed(() =>
  data.value
    ? `${data.value.range.start ? dateLabel(data.value.range.start) : "All records"} – ${dateLabel(data.value.range.end)}`
    : "",
);

function applyRange() {
  if (validRange.value) customRange.value = { start: customStart.value, end: customEnd.value };
}

function cell(values: typeof empty, key: (typeof rows)[number]["key"]) {
  if (key !== "ratio") return number.format(values[key]);
  if (!values.donors) return values.requests ? "No donors" : "—";
  return number.format(values.requests / values.donors);
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Reports</h1>
      <p class="text-sm text-muted mt-1">Requests, donations and the donor pool by blood group.</p>
    </div>

    <section aria-label="Report dates" class="space-y-3">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Report period">
        <UButton
          v-for="item in periods"
          :key="item.value"
          color="neutral"
          :variant="period === item.value ? 'solid' : 'subtle'"
          :aria-pressed="period === item.value"
          @click="period = item.value"
          >{{ item.label }}</UButton
        >
      </div>
      <form
        v-if="period === 'custom'"
        class="flex flex-wrap items-end gap-3"
        @submit.prevent="applyRange"
      >
        <UFormField label="From">
          <UInput v-model="customStart" type="date" :max="customEnd || today" required />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="customEnd" type="date" :min="customStart" :max="today" required />
        </UFormField>
        <UButton type="submit" :disabled="!validRange">Apply dates</UButton>
      </form>
    </section>

    <UAlert
      v-if="error"
      color="error"
      title="Could not load reports"
      :description="error.data?.message ?? error.message"
    >
      <template #actions
        ><UButton color="error" variant="subtle" @click="refresh()">Try again</UButton></template
      >
    </UAlert>
    <div v-else-if="pending" class="py-12 text-center text-sm text-muted" role="status">
      Loading reports…
    </div>
    <template v-else-if="data">
      <section aria-labelledby="report-trends" class="space-y-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="report-trends" class="text-lg font-semibold">Trends</h2>
          <p class="text-xs text-muted">{{ rangeLabel }} · Maldives time</p>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <ReportTrend
            v-for="metric in metrics"
            :key="metric.key"
            :title="metric.label"
            :total="total[metric.key]"
            :color="metric.color"
            :points="
              data.trends.map((point) => ({
                date: point.date,
                label: trendLabel(point.date),
                value: point[metric.key],
              }))
            "
          />
        </div>
        <details v-if="data.trends.length" class="text-sm">
          <summary class="cursor-pointer text-muted w-fit">
            View counts by {{ intervalLabel }}
          </summary>
          <div class="overflow-x-auto mt-3 rounded-lg border border-default">
            <table class="w-full text-sm text-right tabular-nums">
              <caption class="sr-only">
                {{
                  intervalLabel === "week" ? "Weekly" : "Monthly"
                }}
                counts for the selected dates
              </caption>
              <thead class="bg-elevated">
                <tr>
                  <th scope="col" class="p-3 text-left">
                    {{ intervalLabel === "week" ? "Week starting" : "Month" }}
                  </th>
                  <th v-for="metric in metrics" :key="metric.key" scope="col" class="p-3">
                    {{ metric.label }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="point in data.trends" :key="point.date">
                  <th scope="row" class="p-3 text-left font-normal whitespace-nowrap">
                    {{ trendLabel(point.date) }}
                  </th>
                  <td v-for="metric in metrics" :key="metric.key" class="p-3">
                    {{ number.format(point[metric.key]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section aria-labelledby="blood-group-report" class="space-y-3">
        <div>
          <h2 id="blood-group-report" class="text-lg font-semibold">Blood-group summary</h2>
          <p class="text-xs text-muted mt-1">
            Dates apply to requests, donations, new donors and response records. The current donor
            pool includes all dates.
          </p>
        </div>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm text-right tabular-nums whitespace-nowrap">
            <caption class="sr-only">
              Blood-group summary. Total is the first numeric column.
            </caption>
            <thead class="bg-elevated">
              <tr>
                <th scope="col" class="sticky left-0 z-10 bg-elevated p-3 text-left min-w-48">
                  Summary
                </th>
                <th
                  v-for="group in groups"
                  :key="group.label"
                  scope="col"
                  class="p-3 min-w-20"
                  :class="group.label === 'Total' ? 'bg-primary/10 text-primary' : ''"
                >
                  {{ group.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in rows" :key="row.key">
                <th scope="row" class="sticky left-0 bg-default p-3 text-left font-medium">
                  {{ row.label }}
                </th>
                <td
                  v-for="group in groups"
                  :key="group.label"
                  class="p-3"
                  :class="group.label === 'Total' ? 'bg-primary/5 font-semibold' : ''"
                >
                  {{ cell(group.values, row.key) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted">
          The donor pool includes Donor, Temporary and Reserved records. Requests per donor compares
          recorded requests with this pool; it does not show current availability.
        </p>
        <p class="text-xs text-muted">
          Response records may be incomplete. They use the request's blood group and the response
          date. Each record is for one donor and request, so a person can be counted more than once.
        </p>
      </section>
    </template>
  </div>
</template>
