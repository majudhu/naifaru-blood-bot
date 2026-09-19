<script setup lang="ts">
import type { SelectItem, TableColumn } from "@nuxt/ui";
import { PER_PAGE } from "~~/shared/utils/const";

type DonationRow = NonNullable<typeof data.value>["data"][number];

const { user } = useUserSession();

if (user.value?.role !== "admin") navigateTo("/");

const bloodTypes: SelectItem[] = Array.from(bloodTypeValues);
bloodTypes[0] = "All";

const page = ref(1);
const search = ref("");
const type = ref("All");

watch([search, type], () => {
  page.value = 1;
});

const { data, pending } = await useLazyFetch("/api/donations", {
  query: { page, search, type },
});

const columns: TableColumn<DonationRow>[] = [
  { accessorKey: "id", header: "#" },
  { id: "donor", header: "Donor" },
  { id: "phone", header: "Phone" },
  { accessorKey: "bloodType", header: "Blood Group" },
  {
    accessorKey: "donatedAt",
    header: "Donated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
];
</script>

<template>
  <h1 class="text-2xl font-semibold pb-4">Donations</h1>

  <div class="flex items-center flex-wrap gap-4">
    <UInput v-model="search" placeholder="Search donor name or phone" />
    <USelect v-model="type" :items="bloodTypes" class="w-20" />

    <small class="text-muted text-sm">{{ data?.total }} Donations</small>
  </div>

  <UTable :data="data?.data" :columns="columns" :loading="pending">
    <template #donor-cell="{ row }">
      <span v-if="row.original.donor">{{ row.original.donor.name }}</span>
      <span v-else class="text-muted">Unknown donor</span>
    </template>
    <template #phone-cell="{ row }">
      <span v-if="row.original.donor?.phone">{{ row.original.donor.phone }}</span>
      <span v-else class="text-muted">Not provided</span>
    </template>
    <template #bloodType-cell="{ row }">
      <span v-if="row.original.bloodType">{{ row.original.bloodType }}</span>
      <span v-else class="text-muted">-</span>
    </template>
    <template #donatedAt-cell="{ row }">
      <NuxtTime :datetime="row.original.donatedAt" date-style="medium" />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="PER_PAGE" :total="data?.total" />
</template>
