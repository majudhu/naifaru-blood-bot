<script setup lang="ts">
import type { FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import { refDebounced } from "@vueuse/core";
import { FetchError } from "ofetch";

type User = NonNullable<typeof data.value>["data"][number];
type UserEdit = Omit<
  { [K in keyof User]-?: NonNullable<User[K]> },
  "id" | "telegramUserId" | "createdAt" | "updatedAt"
>;

const toast = useToast();
const { user } = useUserSession();

const dayms = 1000 * 60 * 60 * 24;
const epochString = "1970-01-01T00:00:00.000Z";

const columns: TableColumn<User>[] = [
  { accessorKey: "id", header: "#" },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "phone",
    header: "Phone",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  {
    accessorKey: "nid",
    header: "NID",
    meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } },
  },
  { accessorKey: "bloodType", header: "Blood Type" },
  {
    accessorKey: "lastDonatedAt",
    header: "Last Donated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  {
    accessorKey: "isAvailable",
    header: "Donor",
    cell({ row }) {
      const days = Math.ceil(90 - (Date.now() - Date.parse(row.original.lastDonatedAt)) / dayms);
      return row.original.isAvailable
        ? days < 1
          ? h("span", { class: "text-lg leading-0" }, "✅")
          : `⏳ ${days} days`
        : "-";
    },
  },
];

const bloodTypes: SelectItem[] = Array.from(bloodTypeValues);
bloodTypes[0] = "All";
const sexes: SelectItem[] = [
  { label: "Male", value: "m" },
  { label: "Female", value: "f" },
];

const donorStatuses = [
  { label: "Ready now", value: "ready" },
  { label: "Cooldown", value: "cooldown" },
  { label: "All donors", value: "donors" },
  { label: "Non-donors", value: "non-donors" },
  { label: "All users", value: "all" },
];

const page = ref(1);
const search = ref("");
const searchDebounced = refDebounced(search, 300);
const type = ref("All");
const donorStatus = ref("ready");
const showDialog = ref(false);
const isLoading = ref(false);
const editId = ref(0);
const edit = reactive<UserEdit>({
  name: "",
  telegramUsername: "",
  phone: "",
  bloodType: "",
  nid: "",
  sex: "",
  dob: new Date().toLocaleDateString("en-CA"),
  address: "",
  island: "",
  isAvailable: false,
  lastDonatedAt: "",
  notes: "",
});
const expandDetails = ref(false);
const view = shallowRef<User>();

const isNew = computed(() => editId.value === 0);

const dashboard = await useLazyFetch("/api/dashboard");
const { data, pending, refresh } = await useLazyFetch("/api/users", {
  query: { page, search: searchDebounced, type, status: donorStatus },
});

function resetForm() {
  editId.value = 0;
  edit.name = "";
  edit.telegramUsername = "";
  edit.phone = "";
  edit.bloodType = "";
  edit.nid = "";
  edit.sex = "";
  edit.dob = new Date().toLocaleDateString("en-CA");
  edit.address = "";
  edit.island = "";
  edit.isAvailable = false;
  edit.lastDonatedAt = "";
  edit.notes = "";
  edit.phone = "";
  view.value = undefined;
  expandDetails.value = false;
}

async function save(event: FormSubmitEvent<UserEdit>) {
  try {
    isLoading.value = true;

    if (editId.value)
      await $fetch(`/api/users/${editId.value}`, { method: "PUT", body: event.data });
    else await $fetch("/api/users", { method: "POST", body: event.data });

    refresh();
    dashboard.refresh();

    if (!editId.value) page.value = Math.ceil((data.value?.total! + 1) / 20) || 1; // oxlint-disable-line typescript/no-non-null-asserted-optional-chain

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
  expandDetails.value = true;
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
  expandDetails.value = false;
  showDialog.value = true;
}

const lastDonated = computed(() => {
  if (!edit.lastDonatedAt || edit.lastDonatedAt === epochString) return "Last donated: -";
  const days = Math.ceil((Date.now() - Date.parse(edit.lastDonatedAt)) / dayms);
  if (days < 100) return `Last donated ${days} days ago`;
  if (days < 365) return `Last donated ${Math.floor(days / 30)} months ago`;
  else return `Last donated ${Math.floor(days / 365)} years ago`;
});
</script>

<template>
  <h1 class="text-2xl font-semibold pb-4">Dashboard</h1>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4">
    <NuxtLink to="/requests">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        title="0"
        description="Active Requests"
      />
    </NuxtLink>
    <NuxtLink to="/requests?priority=1">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        title="0"
        description="Priority Requests"
      />
    </NuxtLink>
    <UCard
      :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
      :title="String(dashboard.data?.value?.donors)"
      description="Total Donors"
    />
    <UCard
      :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
      :title="String(dashboard.data?.value?.new)"
      description="New this month"
    />
  </div>

  <div class="flex flex-wrap gap-3 md:gap-4 pb-4">
    <UButton
      color="neutral"
      variant="subtle"
      :label="`Ready: ${dashboard.data?.value?.ready}`"
      size="md"
      class="font-semibold"
      @click="
        donorStatus = 'ready';
        type = 'All';
      "
    />
    <UButton
      v-if="dashboard.data?.value?.ready"
      v-for="group in dashboard.data?.value?.groups"
      color="neutral"
      variant="subtle"
      size="md"
      @click="type = group.type"
    >
      <strong>{{ group.type }}: {{ group.ready }}</strong> / {{ group.total }}
    </UButton>
  </div>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search" @change="page = 1" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" @change="page = 1" />
    <USelect v-model="donorStatus" :items="donorStatuses" class="w-32" @change="page = 1" />

    <small class="text-muted text-sm">{{ data?.total }} Users</small>

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

            <UCheckbox v-model="edit.isAvailable" label="Donor" class="pb-2" />
          </div>

          <UFormField label="Phone">
            <UInput v-model="edit.phone" class="w-full" minlength="7" />
          </UFormField>

          <UFormField label="National ID">
            <UInput v-model="edit.nid" class="w-full" minlength="7" maxlength="7" />
          </UFormField>

          <small class="flex flex-wrap md:grid-cols-2">
            {{ lastDonated }} &emsp; Age:
            {{ Math.floor((Date.now() - Date.parse(edit.dob)) / 365 / dayms) }} years
          </small>

          <UCollapsible
            class="md:col-span-2"
            v-model:open="expandDetails"
            :ui="{ content: 'grid md:grid-cols-2 gap-3' }"
          >
            <template #content>
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
          <UButton
            v-if="user?.role === 'admin'"
            :label="`${expandDetails ? 'Hide' : 'Show'} Details`"
            color="neutral"
            variant="subtle"
            class="justify-center"
            :class="isNew ? 'hidden' : ''"
            @click="expandDetails = !expandDetails"
          />
        </UForm>
      </template>
    </UModal>
  </div>

  <UTable
    :data="data?.data"
    :columns="columns"
    :loading="pending"
    @select="onSelect"
    cellpadding=""
  >
    <template #lastDonatedAt-cell="{ row }">
      <span v-if="row.original.lastDonatedAt === epochString">-</span>
      <NuxtTime v-else :datetime="row.original.lastDonatedAt" date-style="short" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="20" :total="data?.total" />
</template>
