<script setup lang="ts">
import type { FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import { FetchError } from "ofetch";

type User = NonNullable<typeof data.value>["data"][number];
type UserEdit = Omit<
  { [K in keyof User]-?: NonNullable<User[K]> },
  "id" | "telegramUserId" | "createdAt" | "updatedAt"
>;

const toast = useToast();

const dayms = 1000 * 60 * 60 * 24;
const epochString = "1970-01-01T00:00:00.000Z";

const columns: TableColumn<User>[] = [
  { accessorKey: "id", header: "#" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "bloodType", header: "Blood Type" },
  {
    accessorKey: "lastDonatedAt",
    header: "Last Donated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  {
    accessorKey: "isAvailable",
    header: "Available",
    cell({ row }) {
      const days = Math.floor(90 - (Date.now() - Date.parse(row.original.lastDonatedAt)) / dayms);
      return `${row.original.isAvailable ? `${days < 1 ? "✅" : `⏳ ${days} days`}` : "-"}`;
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } },
  },
];

const bloodTypes: SelectItem[] = Array.from(bloodTypeValues);
bloodTypes[0] = "All";
const sexes: SelectItem[] = [
  { label: "Male", value: "m" },
  { label: "Female", value: "f" },
];

const page = ref(1);
const search = ref("");
const type = ref("All");
const showDialog = ref(false);
const isLoading = ref(false);
const editId = ref(0);
const edit = reactive<UserEdit>({
  name: "",
  telegramUsername: "",
  phone: "",
  bloodType: "",
  nid: "",
  sex: "m",
  dob: new Date().toLocaleDateString("en-CA"),
  address: "",
  island: "",
  isAvailable: false,
  lastDonatedAt: "",
  notes: "",
});
const view = shallowRef<User>();

const isNew = computed(() => editId.value === 0);

const { data, pending, refresh } = await useLazyFetch("/api/users", {
  query: { page, search, type },
});

function resetForm() {
  editId.value = 0;
  edit.name = "";
  edit.telegramUsername = "";
  edit.phone = "";
  edit.bloodType = "";
  edit.nid = "";
  edit.sex = "m";
  edit.dob = new Date().toLocaleDateString("en-CA");
  edit.address = "";
  edit.island = "";
  edit.isAvailable = false;
  edit.lastDonatedAt = "";
  edit.notes = "";
  edit.phone = "";
  view.value = undefined;
}

async function save(event: FormSubmitEvent<UserEdit>) {
  try {
    isLoading.value = true;

    if (editId.value)
      await $fetch(`/api/users/${editId.value}`, { method: "PUT", body: event.data });
    else await $fetch("/api/users", { method: "POST", body: event.data });

    refresh();

    page.value = Math.ceil((data.value?.total! + 1) / 20) || 1; // oxlint-disable-line typescript/no-non-null-asserted-optional-chain

    toast.add({
      title: editId.value ? "User updated" : "User added",
      color: "success",
    });

    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: editId.value ? "Could not update User" : "Could not add User",
      description: (error as FetchError)?.data.message ?? (error as Error).message,
      color: "error",
    });
  }
  isLoading.value = false;
}

function add() {
  resetForm();
  showDialog.value = true;
}

function onSelect(e: Event, row: TableRow<User>) {
  editId.value = row.original.id;
  edit.name = row.original.name;
  edit.telegramUsername = row.original.telegramUsername || "";
  edit.phone = row.original.phone || "";
  edit.bloodType = row.original.bloodType;
  edit.nid = row.original.nid || "";
  edit.sex = row.original.sex;
  edit.dob = new Date(row.original.dob).toLocaleDateString("en-CA");
  edit.address = row.original.address;
  edit.island = row.original.island;
  edit.isAvailable = row.original.isAvailable;
  edit.lastDonatedAt =
    row.original.lastDonatedAt === epochString
      ? ""
      : new Date(row.original.lastDonatedAt).toLocaleDateString("en-CA");
  edit.notes = row.original.notes;
  view.value = row.original;
  showDialog.value = true;
}
</script>

<template>
  <h1 class="text-2xl font-semibold pb-4">Dashboard</h1>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4">
    <NuxtLink to="/requests">
      <UCard :ui="{ title: 'text-2xl' }" title="0" description="Active Requests" />
    </NuxtLink>
    <NuxtLink to="/requests?priority=1">
      <UCard :ui="{ title: 'text-2xl' }" title="0" description="Priority Requests" />
    </NuxtLink>
    <UCard :ui="{ title: 'text-2xl' }" :title="String(data?.donors)" description="Total Donors" />
    <UCard :ui="{ title: 'text-2xl' }" :title="String(data?.new)" description="New this month" />
  </div>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" />

    <UModal
      v-model:open="showDialog"
      size=""
      :title="isNew ? 'Add User' : 'Edit User'"
      class="ml-auto"
      :ui="{ content: 'max-w-2xl' }"
    >
      <UButton icon="i-lucide-user-plus" @click="add">Add User</UButton>
      <template #body>
        <UForm :state="edit" @submit="save" class="grid md:grid-cols-2 gap-3">
          <UFormField label="Name">
            <UInput v-model="edit.name" class="w-full" required />
          </UFormField>

          <UFormField label="Blood Type">
            <USelect v-model="edit.bloodType" :items="bloodTypes" class="w-full" />
          </UFormField>

          <UFormField label="Last Donation Date" class="flex-1">
            <UInput v-model="edit.lastDonatedAt" class="w-full" type="date" />
          </UFormField>

          <div class="flex items-end justify-between gap-4">
            <UButton
              color="secondary"
              @click="edit.lastDonatedAt = new Date().toLocaleDateString('en-CA')"
            >
              Today
            </UButton>

            <UCheckbox v-model="edit.isAvailable" label="Available" class="pb-2" />
          </div>

          <UCollapsible
            class="md:col-span-2"
            :default-open="isNew"
            :ui="{ content: 'grid md:grid-cols-2 gap-3' }"
          >
            <UButton
              label="Expand Details"
              color="neutral"
              variant="subtle"
              class="block ml-auto"
              :class="isNew ? 'hidden' : ''"
            />
            <template #content>
              <UFormField label="Phone">
                <UInput v-model="edit.phone" class="w-full" minlength="7" />
              </UFormField>

              <UFormField label="National ID">
                <UInput v-model="edit.nid" class="w-full" minlength="7" maxlength="7" />
              </UFormField>

              <UFormField label="Sex">
                <USelect v-model="edit.sex" :items="sexes" class="w-full" />
              </UFormField>

              <UFormField label="Date of birth">
                <UInput v-model="edit.dob" class="w-full" type="date" />
              </UFormField>

              <UFormField label="Address">
                <UInput v-model="edit.address" class="w-full" />
              </UFormField>

              <UFormField label="Island">
                <UInput v-model="edit.island" class="w-full" />
              </UFormField>

              <UFormField label="Telegram User ID" class="opacity-50" v-if="!isNew">
                <UInput :value="view?.telegramUserId" class="w-full" readonly />
              </UFormField>

              <UFormField label="Telegram Username">
                <UInput v-model="edit.telegramUsername" class="w-full" minlength="7" />
              </UFormField>

              <UFormField label="Notes" class="md:col-span-2">
                <UTextarea v-model="edit.notes" class="w-full" />
              </UFormField>

              <small v-if="view" class="md:col-span-2 text-muted">
                Created:
                <NuxtTime :datetime="view.updatedAt" date-style="short" time-style="short" />
                &emsp; Updated:
                <NuxtTime :datetime="view.updatedAt" date-style="short" time-style="short" />
              </small>
            </template>
          </UCollapsible>

          <UButton
            type="submit"
            :icon="isNew ? 'i-lucide-user-plus' : 'i-lucide-user-check'"
            :loading="isLoading"
            :disabled="isLoading"
          >
            {{ isNew ? "Add" : "Save" }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>

  <UTable :data="data?.data" :columns="columns" :loading="pending" @select="onSelect">
    <template #lastDonatedAt-cell="{ row }">
      <span v-if="row.original.lastDonatedAt === epochString">-</span>
      <NuxtTime v-else :datetime="row.original.lastDonatedAt" date-style="short" />
    </template>
    <template #updatedAt-cell="{ row }">
      <NuxtTime :datetime="row.original.updatedAt" date-style="short" time-style="short" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="20" :total="data?.total" />
</template>
