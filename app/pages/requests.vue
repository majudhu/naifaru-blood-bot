<script setup lang="ts">
import type { FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import { FetchError } from "ofetch";

type BloodRequest = NonNullable<typeof data.value>["data"][number];
type RequestEdit = Omit<BloodRequest, "id" | "createdAt" | "updatedAt">;

const route = useRoute();
const toast = useToast();

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
const priority = ref(route.query.priority === "1");
const showDialog = ref(false);
const isLoading = ref(false);
const editId = ref(0);
const edit = reactive<RequestEdit>({
  userId: null,
  bloodType: "",
  location: "",
  island: "",
  unitsNeeded: 1,
  urgent: false,
  status: "open",
  notes: "",
});

const isNew = computed(() => editId.value === 0);

const { data, pending, refresh } = await useLazyFetch("/api/requests", {
  query: { page, search, type, status, priority },
});

const columns: TableColumn<BloodRequest>[] = [
  { accessorKey: "id", header: "#" },
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
  {
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } },
  },
];

function resetForm() {
  editId.value = 0;
  edit.userId = null;
  edit.bloodType = "";
  edit.location = "";
  edit.island = "";
  edit.unitsNeeded = 1;
  edit.urgent = false;
  edit.status = "open";
  edit.notes = "";
}

function add() {
  resetForm();
  showDialog.value = true;
}

function onSelect(e: Event, row: TableRow<BloodRequest>) {
  editId.value = row.original.id;
  edit.userId = row.original.userId;
  edit.bloodType = row.original.bloodType;
  edit.location = row.original.location;
  edit.island = row.original.island;
  edit.unitsNeeded = row.original.unitsNeeded;
  edit.urgent = row.original.urgent;
  edit.status = row.original.status;
  edit.notes = row.original.notes;
  showDialog.value = true;
}

async function save({ data }: FormSubmitEvent<RequestEdit>) {
  try {
    isLoading.value = true;

    const body = { ...data, userId: data.userId || null };

    if (editId.value) await $fetch(`/api/requests/${editId.value}`, { method: "PUT", body });
    else await $fetch("/api/requests", { method: "POST", body });

    refresh();
    toast.add({ title: editId.value ? "Request updated" : "Request added", color: "success" });
    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: editId.value ? "Could not update request" : "Could not add request",
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
      :ui="{ content: 'max-w-2xl' }"
    >
      <UButton icon="i-lucide-plus" @click="add">Add Request</UButton>
      <template #body>
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

          <UButton type="submit" icon="i-lucide-save" :loading="isLoading" :disabled="isLoading">
            {{ isNew ? "Add" : "Save" }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search location or island" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" />
    <USelect v-model="status" :items="statuses" class="w-36" />
    <UCheckbox v-model="priority" label="Priority only" />
  </div>

  <UTable :data="data?.data" :columns="columns" :loading="pending" @select="onSelect">
    <template #status-cell="{ row }">
      <span class="capitalize">{{ row.original.status }}</span>
    </template>
    <template #updatedAt-cell="{ row }">
      <NuxtTime :datetime="row.original.updatedAt" date-style="short" time-style="short" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="20" :total="data?.total" />
</template>
