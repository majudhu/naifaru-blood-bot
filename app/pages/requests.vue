<script setup lang="ts">
import type { FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import type { InternalApi } from "nitropack";
import { FetchError } from "ofetch";
import type { BloodRequest as DbBloodRequest } from "~~/server/schema";
import { PER_PAGE } from "~~/shared/utils/const";

type RequestRow = NonNullable<typeof data.value>["data"][number];
type RequestDetails = InternalApi["/api/requests/:id"]["get"];

const toast = useToast();
const { user } = useUserSession();
const { query } = useRoute();
const canManageRequests = computed(() => user.value?.role === "admin");

const bloodTypes: SelectItem[] = Array.from(bloodTypeValues);
bloodTypes[0] = "All";
const statuses: SelectItem[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Fulfilled", value: "fulfilled" },
  { label: "Cancelled", value: "cancelled" },
];
const editStatuses = statuses.slice(1);

const page = ref(1);
const search = ref("");
const type = ref("All");
const status = ref("all");
const month = ref(0);
const priority = ref(query.priority === "1");
const showDialog = ref(false);
const isLoading = ref(false);
const editDetails = shallowRef<Partial<RequestDetails>>({});

const isNew = computed(() => !editDetails.value.id);
const responseStatuses = {
  contacted: { label: "Contacted", color: "info" },
  accepted: { label: "Accepted", color: "success" },
  declined: { label: "Declined", color: "error" },
  donated: { label: "Donated", color: "primary" },
} as const;

watch([search, type, status, priority], () => {
  page.value = 1;
});

const summary = await useLazyFetch("/api/requests-summary", { query: { month } });
const { data, pending, refresh } = await useLazyFetch("/api/requests", {
  query: { page, search, type, status, priority },
});

const columns: TableColumn<RequestRow>[] = [
  { accessorKey: "id", header: "#" },
  { id: "requester", header: "Requester" },
  { id: "phone", header: "Phone" },
  { accessorKey: "bloodType", header: "Blood Type" },
  { accessorKey: "location", header: "Location" },
  {
    accessorKey: "island",
    header: "Island",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  { accessorKey: "unitsNeeded", header: "Units" },
  {
    accessorKey: "urgent",
    header: "Priority",
    cell: ({ row }) => (row.original.urgent ? "✅" : "-"),
  },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "responseCount", header: "Responses" },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } },
  },
];

const BLANK_REQUEST = {
  userId: null as DbBloodRequest["userId"],
  bloodType: "" as DbBloodRequest["bloodType"],
  location: "",
  island: "",
  unitsNeeded: 1,
  urgent: false,
  status: "open" as DbBloodRequest["status"],
  notes: "",
};

const edit = reactive({ ...BLANK_REQUEST });

function resetForm() {
  editDetails.value = {};
  isLoading.value = false;
  Object.assign(edit, BLANK_REQUEST);
}

function add() {
  resetForm();
  showDialog.value = true;
}

async function onSelect(_event: Event, row: TableRow<RequestRow>) {
  if (!canManageRequests.value) return;

  editDetails.value = row.original;
  Object.assign(edit, {
    ...BLANK_REQUEST,
    bloodType: row.original.bloodType,
    location: row.original.location,
    island: row.original.island,
    unitsNeeded: row.original.unitsNeeded,
    urgent: row.original.urgent,
    status: row.original.status,
  });
  showDialog.value = true;

  isLoading.value = true;

  try {
    const request = await $fetch(`/api/requests/${row.original.id}`);
    if (editDetails.value.id === row.original.id) {
      Object.assign(edit, {
        userId: request.userId,
        bloodType: request.bloodType,
        location: request.location,
        island: request.island,
        unitsNeeded: request.unitsNeeded,
        urgent: request.urgent,
        status: request.status,
        notes: request.notes,
      });
      editDetails.value = request;
      isLoading.value = false;
    }
  } catch (error) {
    if (editDetails.value.id !== row.original.id) return;
    isLoading.value = false;
    toast.add({
      title: "Could not load request details",
      description: (error as FetchError)?.data?.message ?? (error as Error).message,
      color: "error",
    });
  }
}

async function save({ data }: FormSubmitEvent<typeof edit>) {
  try {
    isLoading.value = true;

    const body = { ...data, userId: data.userId || null };

    if (isNew.value) await $fetch("/api/requests", { method: "POST", body });
    else await $fetch(`/api/requests/${editDetails.value.id}`, { method: "PUT", body });

    refresh();
    toast.add({ title: isNew.value ? "Request added" : "Request updated", color: "success" });
    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: isNew.value ? "Could not add request" : "Could not update request",
      description: (error as FetchError)?.data.message ?? (error as Error).message,
      color: "error",
    });
  }
  isLoading.value = false;
}
</script>

<template>
  <div class="flex items-center gap-4 justify-between">
    <h1 class="text-2xl font-semibold pb-4">Requests</h1>

    <UModal
      v-model:open="showDialog"
      :title="isNew ? 'Add Request' : 'Edit Request'"
      :ui="{ content: 'max-w-3xl' }"
    >
      <UButton v-if="canManageRequests" icon="i-lucide-plus" @click="add">Add Request</UButton>
      <template #body>
        <section v-if="!isNew" class="mb-4 rounded-lg border border-default p-4">
          <h2 class="mb-2 text-sm font-semibold">Requester details</h2>
          <dl v-if="editDetails.requester" class="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt class="text-muted">Name</dt>
              <dd>{{ editDetails.requester.name }}</dd>
            </div>
            <div>
              <dt class="text-muted">Phone number</dt>
              <dd>
                <span v-if="editDetails.requester.phone">{{ editDetails.requester.phone }}</span>
                <span v-else class="text-muted">Not provided</span>
              </dd>
            </div>
            <div>
              <dt class="text-muted">Telegram username</dt>
              <dd>
                {{
                  editDetails.requester.telegramUsername
                    ? `@${editDetails.requester.telegramUsername}`
                    : "Not provided"
                }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">User ID</dt>
              <dd>{{ editDetails.requester.id }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-muted">No requester linked</p>
        </section>
        <section v-if="!isNew" class="mb-4 rounded-lg border border-default p-4">
          <h2 class="mb-2 text-sm font-semibold">
            Donor responses<span v-if="editDetails.responses">
              ({{ editDetails.responses.length }})</span
            >
          </h2>
          <p v-if="!editDetails.responses" class="text-sm text-muted">
            {{ isLoading ? "Loading donor responses…" : "Donor responses could not be loaded." }}
          </p>
          <p v-else-if="!editDetails.responses.length" class="text-sm text-muted">
            No donor responses yet.
          </p>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="response in editDetails.responses"
              :key="response.id"
              class="py-3 first:pt-0 last:pb-0"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 text-sm">
                  <p class="font-medium text-default">
                    {{ response.donor?.name ?? `Donor #${response.donorId}` }}
                  </p>
                  <p v-if="response.donor?.telegramUsername" class="text-muted">
                    @{{ response.donor.telegramUsername }}
                  </p>
                  <p>{{ response.donor?.phone || "Phone not provided" }}</p>
                </div>
                <UBadge :color="responseStatuses[response.status].color" variant="subtle">
                  {{ responseStatuses[response.status].label }}
                </UBadge>
              </div>
              <NuxtTime
                :datetime="response.respondedAt"
                date-style="medium"
                time-style="short"
                class="text-xs text-muted"
              />
              <p v-if="response.notes" class="mt-1 whitespace-pre-wrap break-words text-sm">
                {{ response.notes }}
              </p>
            </li>
          </ul>
        </section>
        <UForm :state="edit" @submit="save" class="grid md:grid-cols-2 gap-3">
          <UFormField label="Blood Type">
            <USelect v-model="edit.bloodType" :items="bloodTypes" class="w-full" required />
          </UFormField>

          <UFormField label="Units Needed">
            <UInput
              v-model.number="edit.unitsNeeded"
              type="number"
              min="1"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField label="Location">
            <UInput v-model="edit.location" class="w-full" />
          </UFormField>

          <UFormField label="Island">
            <UInput v-model="edit.island" class="w-full" />
          </UFormField>

          <UFormField label="Requester User ID">
            <UInput v-model.number="edit.userId" type="number" min="1" class="w-full" />
          </UFormField>

          <UFormField label="Status">
            <USelect v-model="edit.status" :items="editStatuses" class="w-full" />
          </UFormField>

          <UCheckbox v-model="edit.urgent" label="Priority request" class="py-2" />

          <UFormField label="Notes" class="md:col-span-2">
            <UTextarea v-model="edit.notes" class="w-full" />
          </UFormField>

          <UButton
            type="submit"
            icon="i-lucide-save"
            :loading="isLoading"
            :disabled="isLoading || (!isNew && !editDetails.responses)"
          >
            {{ isNew ? "Add" : "Save" }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>

  <div class="flex flex-wrap gap-3 md:gap-4 pb-4">
    <UButton
      color="neutral"
      variant="subtle"
      :label="`Total: ${summary.data?.value?.total}`"
      size="md"
      class="font-semibold"
      @click="
        type = 'All';
        month = 0;
      "
    />
    <UButton
      color="neutral"
      variant="subtle"
      :label="`Month: ${summary.data?.value?.month}`"
      size="md"
      class="font-semibold"
      @click="
        type = 'All';
        month = 1;
      "
    />
    <UButton
      color="neutral"
      variant="subtle"
      :label="`3 Month: ${summary.data?.value?.month3}`"
      size="md"
      class="font-semibold"
      @click="
        type = 'All';
        month = 3;
      "
    />
    <UButton
      color="neutral"
      variant="subtle"
      :label="`6 Month: ${summary.data?.value?.month6}`"
      size="md"
      class="font-semibold"
      @click="
        type = 'All';
        month = 6;
      "
    />
    <UButton
      color="neutral"
      variant="subtle"
      :label="`Year: ${summary.data?.value?.year}`"
      size="md"
      class="font-semibold"
      @click="
        type = 'All';
        month = 12;
      "
    />
  </div>
  <div class="flex flex-wrap gap-3 md:gap-4 pb-4">
    <UButton
      v-for="group in summary.data?.value?.groups"
      color="neutral"
      variant="subtle"
      size="md"
      @click="void (type = group.type)"
    >
      <strong>{{ group.type }}:</strong> {{ group.total }}
    </UButton>
  </div>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search location or island" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" />
    <USelect v-model="status" :items="statuses" class="w-36" />
    <UCheckbox v-model="priority" label="Priority only" />
  </div>

  <UTable :data="data?.data" :columns="columns" :loading="pending" @select="onSelect">
    <template #requester-cell="{ row }">
      <div v-if="row.original.requester">
        <div>{{ row.original.requester.name }}</div>
        <div v-if="row.original.requester.telegramUsername" class="text-sm text-muted">
          @{{ row.original.requester.telegramUsername }}
        </div>
      </div>
      <span v-else class="text-muted">No requester linked</span>
    </template>
    <template #phone-cell="{ row }">
      <span v-if="row.original.requester?.phone">{{ row.original.requester.phone }}</span>
      <span v-else class="text-muted">Not provided</span>
    </template>
    <template #status-cell="{ row }">
      <span class="capitalize">{{ row.original.status }}</span>
    </template>
    <template #updatedAt-cell="{ row }">
      <NuxtTime :datetime="row.original.updatedAt" date-style="short" time-style="short" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="PER_PAGE" :total="data?.total" />
</template>
