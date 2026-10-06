<script setup lang="ts">
import type { FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import { refDebounced } from "@vueuse/core";
import type { InternalApi } from "nitropack";
import { FetchError } from "ofetch";
import type { User as DbUser } from "~~/server/schema";
import { PER_PAGE, userStatusLabels, userStatusValues } from "~~/shared/utils/const";

type UserRow = NonNullable<typeof data.value>["data"][number];

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
  { label: "Temporary", value: "Temporary" },
  { label: "Reserved", value: "Reserved" },
  { label: "Non-donors", value: "non-donors" },
  { label: "Pending Review", value: "pending" },
  { label: "All users", value: "all" },
];

const STATUS_FILTER: Record<DbUser["status"], string> = {
  Donor: "donors",
  Temporary: "Temporary",
  Reserved: "Reserved",
  "Non-Donor": "non-donors",
  pending: "pending",
};

const toast = useToast();
const { user } = useUserSession();
const isAdmin = computed(() => user.value?.role === "admin");
const isNurse = computed(() => user.value?.role === "nurse");
const isLab = computed(() => user.value?.role === "lab");
const canAddUser = computed(() => user.value?.role === "admin" || isLab.value);

const page = ref(1);
const search = ref("");
const searchDebounced = refDebounced(search, 300);
const type = ref("All");
const donorStatus = ref("donors");
const sex = ref("all");
const showDialog = ref(false);
const isLoading = ref(false);
const editDetails = shallowRef<Partial<InternalApi["/api/users/:id"]["get"]>>({});
const expandDetails = ref(false);

const isNew = computed(() => !editDetails.value.id);
const isPendingReview = computed(() => editDetails.value.status === "pending");
const isReadOnly = computed(
  () => !isNew.value && (isLab.value || (isPendingReview.value && !isAdmin.value)),
);
const editStatuses = computed(() =>
  userStatusValues.map((status) => ({ value: status, label: userStatusLabels[status] })),
);
const dialogTitle = computed(() =>
  isNew.value ? "Add User" : isReadOnly.value ? "View User" : "Edit User",
);
const age = computed(() => formatAge(edit.dob));

const dashboard = await useLazyFetch("/api/dashboard");
const hasPendingRegistrations = computed(() => (dashboard.data.value?.pending ?? 0) > 0);
const { data, pending, refresh } = await useLazyFetch("/api/users", {
  query: { page, search: searchDebounced, type, status: donorStatus, sex },
});

const BLANK_USER = {
  name: "",
  telegramUsername: "",
  phone: "",
  bloodType: "" as (typeof bloodTypeValues)[number],
  nid: "",
  sex: "" as DbUser["sex"],
  dob: "",
  address: "",
  island: "",
  status: "Donor" as DbUser["status"],
  lastDonatedAt: "",
  notes: "",
};

const edit = reactive({ ...BLANK_USER });

const columns: TableColumn<UserRow>[] = [
  { accessorKey: "id", header: "#", accessorFn: (_, i) => PER_PAGE * (page.value - 1) + i + 1 },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "phone",
    header: "Phone",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  {
    accessorKey: "address",
    header: "Address",
    meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } },
  },
  { accessorKey: "bloodType", header: "Blood Type" },
  {
    accessorKey: "lastDonatedAt",
    header: "Last Donated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell({ row }) {
      const days = Math.ceil(90 - (Date.now() - Date.parse(row.original.lastDonatedAt)) / DAY_MS);
      return row.original.status === "Donor"
        ? days < 1
          ? "Donor"
          : `Donor · ⏳ ${days} days`
        : userStatusLabels[row.original.status];
    },
  },
];

function resetForm() {
  editDetails.value = {};
  isLoading.value = false;
  Object.assign(edit, BLANK_USER);
}

const lastDonated = computed(() => {
  if (!edit.lastDonatedAt || isDateNil(edit.lastDonatedAt)) return "Last donated: -";
  const days = Math.ceil((Date.now() - Date.parse(edit.lastDonatedAt)) / DAY_MS);
  if (days < 100) return `Last donated ${days} days ago`;
  if (days < 365) return `Last donated ${Math.floor(days / 30)} months ago`;
  else return `Last donated ${Math.floor(days / 365)} years ago`;
});

async function save(event: FormSubmitEvent<typeof edit>) {
  if (isReadOnly.value) return;

  try {
    isLoading.value = true;

    if (isNew.value) await $fetch("/api/users", { method: "POST", body: event.data });
    else
      await $fetch(`/api/users/${editDetails.value.id}`, {
        method: "PUT",
        body: { ...event.data, expectedStatus: editDetails.value.status },
      });

    const keepPendingFilter = isPendingReview.value && donorStatus.value === "pending";
    if (!keepPendingFilter) donorStatus.value = STATUS_FILTER[event.data.status];

    await Promise.all([refresh(), dashboard.refresh()]);
    const lastPage = Math.max(1, Math.ceil((data.value?.total ?? 0) / PER_PAGE));
    if (isNew.value || page.value > lastPage) page.value = lastPage;

    toast.add({
      title: isNew.value ? "User added" : "User updated",
      color: "success",
    });

    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: isNew.value ? "Could not add User" : "Could not update User",
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

async function onSelect(_event: Event, row: TableRow<UserRow>) {
  editDetails.value = row.original;
  expandDetails.value = isAdmin.value && row.original.status === "pending";
  Object.assign(edit, {
    ...BLANK_USER,
    ...row.original,
    lastDonatedAt: dateInputValue(row.original.lastDonatedAt),
  });
  showDialog.value = true;
  isLoading.value = true;

  try {
    const user = await $fetch(`/api/users/${row.original.id}`);
    if (editDetails.value.id === row.original.id) {
      Object.assign(edit, {
        ...user,
        updatedAt: undefined,
        createdAt: undefined,
        lastDonatedAt: dateInputValue(user.lastDonatedAt),
        dob: dateInputValue(user.dob),
      });
      editDetails.value = user;
      isLoading.value = false; // disable loading and enable submit only if the user fetch is successful
    }
  } catch (error) {
    toast.add({
      title: "Could not load user details",
      description: (error as FetchError)?.data?.message ?? (error as Error).message,
      color: "error",
    });
  }
}

function showUsers(status: "pending" | "donors") {
  search.value = "";
  type.value = "All";
  sex.value = "all";
  page.value = 1;
  donorStatus.value = status;
}
</script>

<template>
  <h1 class="text-2xl font-semibold pb-4">Dashboard</h1>

  <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
    <NuxtLink to="/requests">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        :title="String(dashboard.data?.value?.activeRequests ?? 0)"
        description="Active Requests"
      />
    </NuxtLink>
    <NuxtLink to="/" @click="showUsers('donors')">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        :title="String(dashboard.data?.value?.donors ?? 0)"
        description="Total Donors"
      />
    </NuxtLink>
    <UCard
      :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
      :title="String(dashboard.data?.value?.new ?? 0)"
      description="New in the last 30 days"
    />
    <button
      type="button"
      class="relative text-left cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
      @click="showUsers('pending')"
    >
      <UCard
        :class="{ 'ring-warning': hasPendingRegistrations }"
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        :title="String(dashboard.data?.value?.pending ?? 0)"
        description="New Donors Pending Review"
      />
      <span
        v-if="hasPendingRegistrations"
        aria-hidden="true"
        class="absolute top-3 right-3 size-2 rounded-full bg-warning motion-safe:animate-pulse"
      />
    </button>
    <NuxtLink to="/donations">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        :title="String(dashboard.data?.value?.donations ?? 0)"
        description="Total Donations"
      />
    </NuxtLink>
    <NuxtLink to="/donations">
      <UCard
        :ui="{ title: 'text-2xl', header: 'px-2 py-1 sm:px-3' }"
        :title="String(dashboard.data?.value?.donationsLast30Days ?? 0)"
        description="Donations in the last 30 days"
      />
    </NuxtLink>
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
        sex = 'all';
      "
    />
    <UButton
      v-if="dashboard.data?.value?.ready"
      v-for="group in dashboard.data?.value?.groups"
      color="neutral"
      variant="subtle"
      size="md"
      @click="void (type = group.type)"
    >
      <strong>{{ group.type }}: {{ group.ready }}</strong> / {{ group.total }}
    </UButton>
  </div>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search" @change="page = 1" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" @change="page = 1" />
    <USelect v-model="donorStatus" :items="donorStatuses" class="w-40" @change="page = 1" />

    <USelect
      v-if="user?.role === 'admin'"
      v-model="sex"
      :items="[
        { label: 'All', value: 'all' },
        { label: 'Male', value: 'm' },
        { label: 'Female', value: 'f' },
      ]"
      class="w-32"
      @change="page = 1"
    />

    <small class="text-muted text-sm">{{ data?.total ?? 0 }} Users</small>

    <UModal
      v-model:open="showDialog"
      size=""
      :title="dialogTitle"
      class="ml-auto"
      :ui="{ content: 'max-w-2xl' }"
    >
      <UButton v-if="canAddUser" icon="i-lucide-user-plus" @click="add"> Add User </UButton>
      <template #body>
        <UForm :state="edit" @submit="save" class="grid md:grid-cols-2 gap-3">
          <UFormField label="Name">
            <UInput v-model="edit.name" class="w-full" required :disabled="isNurse || isReadOnly" />
          </UFormField>

          <UFormField label="Blood Type">
            <USelect
              v-model="edit.bloodType"
              :items="bloodTypes"
              class="w-full"
              :disabled="isNurse || isReadOnly"
            />
          </UFormField>

          <UFormField label="Last Donation Date" class="flex-1">
            <UInput
              v-model="edit.lastDonatedAt"
              class="w-full"
              type="date"
              :disabled="isReadOnly"
            />
          </UFormField>

          <div class="flex items-end justify-between gap-4">
            <UButton
              color="secondary"
              :disabled="isReadOnly"
              @click="void (edit.lastDonatedAt = new Date().toLocaleDateString('en-CA'))"
            >
              Today
            </UButton>

            <UFormField label="Status" name="status" class="flex-1">
              <USelect
                v-model="edit.status"
                :items="editStatuses"
                class="w-full"
                :disabled="isNurse || isReadOnly"
              />
            </UFormField>
          </div>

          <UAlert
            v-if="isPendingReview && isAdmin"
            class="md:col-span-2"
            color="neutral"
            variant="outline"
            :ui="{ root: 'px-3 py-1.5', description: 'text-xs text-toned' }"
            description="Contact the applicant and verify their details. Set status to Donor, Reserved, or Temporary to approve, or Non-Donor to reject."
          />

          <UFormField label="Phone">
            <UInput v-model="edit.phone" class="w-full" minlength="7" :disabled="isReadOnly" />
          </UFormField>

          <UFormField label="NID / PP No.">
            <UInput v-model="edit.nid" class="w-full" :disabled="isNurse || isReadOnly" />
          </UFormField>

          <small class="flex flex-wrap md:grid-cols-2 items-center">
            {{ lastDonated }} &emsp; Age: {{ age }}
          </small>

          <UFormField label="Address">
            <UInput v-model="edit.address" class="w-full" :disabled="isReadOnly" />
          </UFormField>

          <UCollapsible
            class="md:col-span-2"
            v-model:open="expandDetails"
            :ui="{ content: 'grid md:grid-cols-2 gap-3' }"
          >
            <template #content>
              <UFormField label="Sex">
                <USelect v-model="edit.sex" :items="sexes" class="w-full" :disabled="isReadOnly" />
              </UFormField>

              <UFormField label="Date of birth">
                <UInput v-model="edit.dob" class="w-full" type="date" :disabled="isReadOnly" />
              </UFormField>

              <UFormField label="Island">
                <UInput v-model="edit.island" class="w-full" :disabled="isReadOnly" />
              </UFormField>

              <UFormField label="Telegram Username">
                <UInput
                  v-model="edit.telegramUsername"
                  class="w-full"
                  minlength="7"
                  :disabled="isReadOnly"
                />
              </UFormField>

              <UFormField label="Notes" class="md:col-span-2">
                <UTextarea v-model="edit.notes" class="w-full" :disabled="isReadOnly" />
              </UFormField>
            </template>
          </UCollapsible>

          <small v-if="!isNew" class="md:col-span-2 text-xs text-muted">
            <template v-if="!expandDetails">
              Sex:&nbsp;{{ edit.sex === "m" ? "Male" : edit.sex === "f" ? "Female" : "-" }} &bull;
              DoB:&nbsp;{{ edit.dob || "-" }} &bull; Island:&nbsp;{{ edit.island || "-" }} &bull;
              TG:&nbsp;{{ edit.telegramUsername || "-" }}
              &bull;
              <template v-if="edit.notes">
                Notes:&nbsp;{{ edit.notes.slice(0, 10) || "-" }}... &bull;
              </template>
            </template>
            Created:&nbsp;<NuxtTime
              :datetime="editDetails.createdAt!"
              date-style="short"
              :time-style="expandDetails ? 'short' : undefined"
            />
            &bull; Updated:&nbsp;<NuxtTime
              :datetime="editDetails.updatedAt!"
              date-style="short"
              :time-style="expandDetails ? 'short' : undefined"
            />
            <template v-if="expandDetails">
              &bull; ID:&nbsp;{{ editDetails.id }} &bull; TGID:&nbsp;{{
                editDetails.telegramUserId ?? "-"
              }}
            </template>
          </small>

          <UButton
            v-if="!isReadOnly"
            type="submit"
            :icon="isNew ? 'i-lucide-user-plus' : 'i-lucide-user-check'"
            :loading="isLoading"
            :disabled="isLoading"
          >
            {{ isNew ? "Add" : "Save" }}
          </UButton>
          <UButton
            v-if="(user?.role === 'admin' || isReadOnly) && !isNew"
            :label="`${expandDetails ? 'Hide' : 'Show'} Details`"
            color="neutral"
            variant="subtle"
            class="justify-center"
            :class="isNew ? 'hidden' : ''"
            @click="void (expandDetails = !expandDetails)"
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
      <span v-if="isDateNil(row.original.lastDonatedAt)">-</span>
      <NuxtTime v-else :datetime="row.original.lastDonatedAt" date-style="short" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="PER_PAGE" :total="data?.total" />
</template>
