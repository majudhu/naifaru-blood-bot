<script setup lang="ts">
import type { TableColumn, TableRow } from "@nuxt/ui";
import { auditActionLabels, auditEntityLabels } from "~~/shared/utils/audit";
import { PER_PAGE } from "~~/shared/utils/const";

definePageMeta({ middleware: "admin" });

const page = ref(1);
const search = ref("");
const action = ref("all");
const entity = ref("all");

const actions = [
  { label: "All actions", value: "all" },
  ...Object.entries(auditActionLabels).map(([value, label]) => ({ label, value })),
];
const entities = [
  { label: "All records", value: "all" },
  ...Object.entries(auditEntityLabels).map(([value, label]) => ({ label, value })),
];

watch([search, action, entity], () => {
  page.value = 1;
});

const { data, pending, error, refresh } = await useLazyFetch("/api/audit-logs", {
  query: { page, search, action, entity },
});

type AuditRow = NonNullable<typeof data.value>["data"][number];

const selectedEntry = ref<AuditRow | null>(null);
const showDetails = ref(false);

const columns: TableColumn<AuditRow>[] = [
  { accessorKey: "createdAt", header: "Time (Maldives)" },
  { accessorKey: "actorName", header: "Staff member" },
  { accessorKey: "actorRole", header: "Role" },
  { accessorKey: "action", header: "Action" },
  { id: "record", header: "Record" },
  { accessorKey: "ipAddress", header: "IP address" },
];

function onSelect(_event: Event, row: TableRow<AuditRow>) {
  selectedEntry.value = row.original;
  showDetails.value = true;
}

function onRowKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLTableRowElement) {
    event.preventDefault();
    event.target.click();
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 pb-2">
    <h1 class="text-2xl font-semibold">Audit Log</h1>
    <UButton
      label="Refresh"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="outline"
      :loading="pending"
      @click="refresh()"
    />
  </div>

  <div class="flex flex-wrap items-center gap-4 pb-4">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search staff, record ID or details"
      aria-label="Search audit log"
      :maxlength="200"
      class="w-full sm:w-80"
    />
    <USelect v-model="action" :items="actions" aria-label="Filter by action" class="w-44" />
    <USelect v-model="entity" :items="entities" aria-label="Filter by record" class="w-44" />
    <span v-if="!error" class="text-sm text-muted">{{ data?.total ?? 0 }} records</span>
  </div>

  <UAlert
    v-if="error"
    title="Could not load the audit log"
    description="Please try Refresh."
    color="error"
    icon="i-lucide-circle-alert"
  />

  <template v-else>
    <UTable
      :data="data?.data"
      :columns="columns"
      :loading="pending"
      empty="No audit records found."
      class="w-full"
      @select="onSelect"
      @keydown.enter="onRowKeydown"
      @keydown.space="onRowKeydown"
    >
      <template #createdAt-cell="{ row }">
        <NuxtTime
          :datetime="row.original.createdAt"
          date-style="medium"
          time-style="medium"
          time-zone="Indian/Maldives"
        />
      </template>
      <template #actorName-cell="{ row }">
        {{ row.original.actorName }}
        <span v-if="row.original.actorId" class="text-muted">#{{ row.original.actorId }}</span>
      </template>
      <template #actorRole-cell="{ row }">
        <span class="capitalize">{{ row.original.actorRole ?? "Unknown" }}</span>
      </template>
      <template #action-cell="{ row }">
        <UBadge
          :color="row.original.action === 'login_failed' ? 'error' : 'neutral'"
          variant="subtle"
        >
          {{ auditActionLabels[row.original.action] }}
        </UBadge>
      </template>
      <template #record-cell="{ row }">
        {{ auditEntityLabels[row.original.entityType] }}
        <span v-if="row.original.entityId">#{{ row.original.entityId }}</span>
      </template>
      <template #ipAddress-cell="{ row }">
        {{ row.original.ipAddress ?? "—" }}
      </template>
    </UTable>
    <UPagination class="py-4" v-model:page="page" :items-per-page="PER_PAGE" :total="data?.total" />
  </template>

  <UModal v-model:open="showDetails" title="Audit details">
    <template #body>
      <template v-if="selectedEntry">
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt class="text-muted">Staff member</dt>
          <dd>
            {{ selectedEntry.actorName }}
            <span v-if="selectedEntry.actorId" class="text-muted"
              >#{{ selectedEntry.actorId }}</span
            >
          </dd>
          <dt class="text-muted">Role</dt>
          <dd class="capitalize">{{ selectedEntry.actorRole ?? "Unknown" }}</dd>
          <dt class="text-muted">Time (Maldives)</dt>
          <dd>
            <NuxtTime
              :datetime="selectedEntry.createdAt"
              date-style="medium"
              time-style="medium"
              time-zone="Indian/Maldives"
            />
          </dd>
          <dt class="text-muted">Action</dt>
          <dd>{{ auditActionLabels[selectedEntry.action] }}</dd>
          <dt class="text-muted">Record</dt>
          <dd>
            {{ auditEntityLabels[selectedEntry.entityType] }}
            <span v-if="selectedEntry.entityId">#{{ selectedEntry.entityId }}</span>
          </dd>
          <dt class="text-muted">IP address</dt>
          <dd>{{ selectedEntry.ipAddress ?? "—" }}</dd>
        </dl>
        <h2 class="font-medium mt-6 mb-2">Details</h2>
        <pre
          v-if="Object.keys(selectedEntry.details).length"
          class="whitespace-pre-wrap break-words text-xs"
          >{{ JSON.stringify(selectedEntry.details, null, 2) }}</pre
        >
        <p v-else class="text-sm text-muted">No additional details for this action.</p>
      </template>
    </template>
  </UModal>
</template>
