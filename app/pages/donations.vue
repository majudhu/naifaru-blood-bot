<script setup lang="ts">
import type { SelectItem, TableColumn } from "@nuxt/ui";
import { FetchError } from "ofetch";
import { PER_PAGE } from "~~/shared/utils/const";

type DonationRow = NonNullable<typeof data.value>["data"][number];

const { user } = useUserSession();

if (user.value?.role !== "admin") navigateTo("/");

const bloodTypes: SelectItem[] = Array.from(bloodTypeValues);
bloodTypes[0] = "All";

const page = ref(1);
const search = ref("");
const type = ref("All");
const toast = useToast();
const selectedDonation = ref<DonationRow | null>(null);
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

watch([search, type], () => {
  page.value = 1;
});

const { data, pending, refresh } = await useLazyFetch("/api/donations", {
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
  { id: "actions", header: "Actions" },
];

function confirmDelete(donation: DonationRow) {
  selectedDonation.value = donation;
  showDeleteDialog.value = true;
}

async function remove() {
  if (!selectedDonation.value || isDeleting.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/donations/${selectedDonation.value.id}`, { method: "DELETE" });

    showDeleteDialog.value = false;
    toast.add({ title: "Donation deleted", color: "success" });
    await refresh();

    const lastPage = Math.max(1, Math.ceil((data.value?.total ?? 0) / PER_PAGE));
    if (page.value > lastPage) page.value = lastPage;
  } catch (error) {
    toast.add({
      title: "Could not delete donation",
      description:
        error instanceof FetchError
          ? (error.data?.message ?? error.message)
          : (error as Error).message,
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}
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
    <template #actions-cell="{ row }">
      <UButton
        label="Delete"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        :disabled="isDeleting"
        @click="confirmDelete(row.original)"
      />
    </template>
  </UTable>

  <UPagination class="py-4" v-model:page="page" :items-per-page="PER_PAGE" :total="data?.total" />

  <UModal
    v-model:open="showDeleteDialog"
    title="Delete donation"
    description="This donation entry will be permanently deleted."
    :close="!isDeleting"
    :dismissible="!isDeleting"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <p v-if="selectedDonation">
        Delete donation #{{ selectedDonation.id }} for
        <strong>{{ selectedDonation.donor?.name ?? "Unknown donor" }}</strong>
        on <NuxtTime :datetime="selectedDonation.donatedAt" date-style="medium" />?
      </p>
    </template>
    <template #footer="{ close }">
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        :disabled="isDeleting"
        @click="close"
      />
      <UButton
        label="Delete donation"
        color="error"
        :loading="isDeleting"
        :disabled="isDeleting"
        @click="remove"
      />
    </template>
  </UModal>
</template>
