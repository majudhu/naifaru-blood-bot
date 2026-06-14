<script setup lang="ts">
import type { FormError, TableColumn, TableRow } from "@nuxt/ui";
import type { Staff } from "#server/schema";
import * as v from "valibot";

const { user } = useUserSession();

if (user.value?.role !== "admin") navigateTo("/");

type StaffRole = Staff["role"];
type StaffUser = Omit<Staff, "password">;

const roleOptions = [
  { label: "Admin", value: "admin" },
  { label: "Nurse", value: "nurse" },
] satisfies { label: string; value: StaffRole }[];

const columns: TableColumn<StaffUser>[] = [
  {
    id: "id",
    accessorKey: "id",
    header: "#",
  },
  {
    id: "username",
    accessorKey: "username",
    header: "Username",
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
  },
  {
    id: "isActive",
    accessorKey: "isActive",
    header: "Active",
    cell: ({ row }) => (row.getValue("isActive") ? "✅" : "❌"),
  },
  {
    id: "updated",
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
];

const toast = useToast();

const editStaff = reactive<
  Pick<Staff, "username" | "password" | "role" | "isActive"> & { confirmPassword: string }
>({
  username: "",
  password: "",
  confirmPassword: "",
  role: "nurse",
  isActive: true,
});

const showDialog = ref(false);
const isLoading = ref(false);
const editStaffId = ref(0);

const isSelf = computed(() => editStaffId.value === user.value?.id);
const isNew = computed(() => editStaffId.value === 0);
const disableSubmit = computed(() => editStaff.password !== editStaff.confirmPassword);

const { data, pending, refresh } = await useLazyFetch("/api/staff", {
  default: () => ({ staff: [] }) as never,
});

function validate(state: Partial<typeof editStaff>): FormError[] {
  if (state.password !== state.confirmPassword)
    return [{ name: "confirmPassword", message: "Passwords do not match" }];
  else return [];
}

async function saveStaff() {
  if (editStaff.password !== editStaff.confirmPassword) {
    toast.add({ title: "Passwords do not match", color: "error" });
    return;
  }

  try {
    isLoading.value = true;
    if (editStaffId.value)
      await $fetch(`/api/staff/${editStaffId.value}`, {
        method: "PUT",
        body: {
          username: editStaff.username,
          role: editStaff.role,
          isActive: editStaff.isActive,
          ...(editStaff.password ? { password: editStaff.password } : {}),
        },
      });
    else await $fetch("/api/staff", { method: "POST", body: editStaff });
    refresh();

    toast.add({ title: editStaffId.value ? "Staff updated" : "Staff added", color: "success" });

    showDialog.value = false;
    editStaffId.value = 0;
    editStaff.username = "";
    editStaff.password = "";
    editStaff.confirmPassword = "";
    editStaff.role = "nurse";
    editStaff.isActive = true;
  } catch (error) {
    toast.add({
      title: editStaffId.value ? "Could not update staff" : "Could not add staff",
      description: (error as Error).message,
      color: "error",
    });
  }
  isLoading.value = false;
}

function addStaff() {
  editStaffId.value = 0;
  editStaff.username = "";
  editStaff.password = "";
  editStaff.confirmPassword = "";
  editStaff.role = "nurse";
  editStaff.isActive = true;
  showDialog.value = true;
}

function onSelect(e: Event, row: TableRow<StaffUser>) {
  editStaffId.value = row.original.id;
  editStaff.username = row.original.username;
  editStaff.password = "";
  editStaff.confirmPassword = "";
  editStaff.role = row.original.role;
  editStaff.isActive = row.original.isActive;
  showDialog.value = true;
}

async function deleteStaff() {
  try {
    isLoading.value = true;
    await $fetch(`/api/staff/${editStaffId.value}`, { method: "DELETE" });
    refresh();
    toast.add({ title: "Staff deleted", color: "warning" });
    showDialog.value = false;
    editStaffId.value = 0;
    editStaff.username = "";
    editStaff.password = "";
    editStaff.confirmPassword = "";
    editStaff.role = "nurse";
    editStaff.isActive = true;
  } catch (error) {
    toast.add({
      title: "Could not delete staff",
      description: (error as Error).message,
      color: "error",
    });
  }
  isLoading.value = false;
}
const emit = defineEmits<{ close: [boolean] }>();
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <div class="flex items-center gap-4 justify-between">
      <h1 class="text-2xl font-semibold tracking-normal text-gray-950 dark:text-white">Staff</h1>

      <UModal v-model:open="showDialog" size="md" :title="isNew ? 'Add Staff' : 'Edit Staff'">
        <UButton icon="i-lucide-user-plus" @click="addStaff">Add Staff</UButton>
        <template #body>
          <UForm
            :validate="validate"
            :state="editStaff"
            @submit="saveStaff"
            class="flex flex-col gap-3"
          >
            <UFormField label="Username">
              <UInput
                v-model="editStaff.username"
                class="w-full"
                required
                minlength="3"
                maxlength="40"
                autocomplete="off"
              />
            </UFormField>

            <UFormField label="Password">
              <UInput
                v-model="editStaff.password"
                class="w-full"
                :required="isNew || editStaff.confirmPassword.length > 0"
                minlength="8"
                maxlength="128"
                type="password"
                autocomplete="new-password"
              />
            </UFormField>

            <UFormField label="Confirm Password" name="confirmPassword">
              <UInput
                v-model="editStaff.confirmPassword"
                class="w-full"
                :required="isNew || editStaff.password.length > 0"
                minlength="8"
                maxlength="128"
                type="password"
                autocomplete="new-password"
              />
            </UFormField>

            <UFormField label="Role">
              <select
                v-model="editStaff.role"
                class="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                :disabled="isSelf"
              >
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </UFormField>

            <label
              class="flex min-h-16 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <input
                v-model="editStaff.isActive"
                type="checkbox"
                class="size-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                :disabled="isSelf"
              />
              Active
            </label>

            <div class="flex items-end justify-between">
              <UButton
                type="submit"
                :icon="isNew ? 'i-lucide-user-plus' : 'i-lucide-user-check'"
                :loading="isLoading"
                :disabled="isLoading || disableSubmit"
              >
                {{ isNew ? "Add" : "Save" }}
              </UButton>

              <UModal size="sm" title="Delete Staff">
                <UButton
                  v-if="!isNew && !isSelf"
                  type="button"
                  icon="i-lucide-user-minus"
                  color="error"
                  :loading="isLoading"
                  :disabled="isLoading"
                >
                  Delete
                </UButton>
                <template #body>
                  Are you sure you want to delete staff member &ldquo;{{
                    editStaff.username
                  }}&rdquo;?
                </template>
                <template #footer="{ close }">
                  <UButton
                    type="button"
                    color="error"
                    class="px-4"
                    :loading="isLoading"
                    :disabled="isLoading"
                    @click="deleteStaff"
                  >
                    Yes
                  </UButton>
                  <UButton
                    type="button"
                    class="ml-4 px-5"
                    :loading="isLoading"
                    :disabled="isLoading"
                    @click="close"
                  >
                    No
                  </UButton>
                </template>
              </UModal>
            </div>
          </UForm>
        </template>
      </UModal>
    </div>

    <UTable :data="data" :columns="columns" :loading="pending" @select="onSelect" />
  </section>
</template>
