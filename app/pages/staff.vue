<script setup lang="ts">
import type { FormError, FormSubmitEvent, SelectItem, TableColumn, TableRow } from "@nuxt/ui";
import { FetchError } from "ofetch";

type Staff = NonNullable<typeof data.value>[number];
type StaffRole = Staff["role"];

const { user } = useUserSession();

if (user.value?.role !== "admin") navigateTo("/");

const roles: SelectItem[] = [
  { label: "Admin", value: "admin" },
  { label: "Nurse", value: "nurse" },
];

const toast = useToast();

const edit = reactive<
  Pick<Staff, "username" | "role" | "isActive"> & {
    password: string;
    confirmPassword: string;
  }
>({
  username: "",
  password: "",
  confirmPassword: "",
  role: "nurse",
  isActive: true,
});

const showDialog = ref(false);
const isLoading = ref(false);
const editId = ref(0);

const isSelf = computed(() => editId.value === user.value?.id);
const isNew = computed(() => editId.value === 0);
const disableSubmit = computed(() => edit.password !== edit.confirmPassword);

const { data, pending, refresh } = useLazyFetch("/api/staff");

const columns: TableColumn<Staff>[] = [
  { accessorKey: "id", header: "#" },
  { accessorKey: "username", header: "Username" },
  { accessorKey: "role", header: "Role" },
  {
    accessorKey: "isActive",
    header: "Active",
    cell: ({ row }) => (row.original.isActive ? "✅" : "❌"),
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } },
  },
];

function validate(state: Partial<typeof edit>): FormError[] {
  if (state.password !== state.confirmPassword)
    return [{ name: "confirmPassword", message: "Passwords do not match" }];
  else return [];
}

function resetForm() {
  editId.value = 0;
  edit.username = "";
  edit.password = "";
  edit.confirmPassword = "";
  edit.role = "nurse";
  edit.isActive = true;
}

async function save({ data }: FormSubmitEvent<typeof edit>) {
  if (data.password !== data.confirmPassword) {
    toast.add({ title: "Passwords do not match", color: "error" });
    return;
  }

  try {
    isLoading.value = true;

    if (editId.value)
      await $fetch(`/api/staff/${editId.value}`, {
        method: "PUT",
        body: {
          username: data.username,
          role: data.role,
          isActive: data.isActive,
          ...(data.password ? { password: data.password } : {}),
        },
      });
    else await $fetch("/api/staff", { method: "POST", body: data });

    refresh();

    toast.add({ title: editId.value ? "Staff updated" : "Staff added", color: "success" });

    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: editId.value ? "Could not update staff" : "Could not add staff",
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

function onSelect(e: Event, row: TableRow<Staff>) {
  editId.value = row.original.id;
  edit.username = row.original.username;
  edit.password = "";
  edit.confirmPassword = "";
  edit.role = row.original.role;
  edit.isActive = row.original.isActive;
  showDialog.value = true;
}

async function remove() {
  try {
    isLoading.value = true;
    await $fetch(`/api/staff/${editId.value}`, { method: "DELETE" });
    refresh();
    toast.add({ title: "Staff deleted", color: "warning" });
    showDialog.value = false;
    resetForm();
  } catch (error) {
    toast.add({
      title: "Could not delete staff",
      description: (error as FetchError)?.data.message ?? (error as Error).message,
      color: "error",
    });
  }
  isLoading.value = false;
}
</script>

<template>
  <div class="flex items-center gap-4 justify-between">
    <h1 class="text-2xl font-semibold pb-4">Staff</h1>

    <UModal v-model:open="showDialog" size="md" :title="isNew ? 'Add Staff' : 'Edit Staff'">
      <UButton icon="i-lucide-user-plus" @click="add">Add Staff</UButton>
      <template #body>
        <UForm :validate="validate" :state="edit" @submit="save" class="flex flex-col gap-3">
          <UFormField label="Username">
            <UInput v-model="edit.username" class="w-full" required minlength="3" maxlength="40" />
          </UFormField>

          <UFormField label="Password">
            <UInput
              v-model="edit.password"
              class="w-full"
              :required="isNew || edit.confirmPassword.length > 0"
              minlength="8"
              maxlength="128"
              type="password"
              autocomplete="new-password"
            />
          </UFormField>

          <UFormField label="Confirm Password" name="confirmPassword">
            <UInput
              v-model="edit.confirmPassword"
              class="w-full"
              :required="isNew || edit.password.length > 0"
              minlength="8"
              maxlength="128"
              type="password"
              autocomplete="new-password"
            />
          </UFormField>

          <UFormField label="Role">
            <USelect v-model="edit.role" :items="roles" class="w-full" />
          </UFormField>

          <UCheckbox label="Active" v-model="edit.isActive" :disabled="isSelf" class="py-2" />

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
                Are you sure you want to delete staff member &ldquo;{{ edit.username }}&rdquo;?
              </template>
              <template #footer="{ close }">
                <UButton
                  type="button"
                  color="error"
                  class="px-4"
                  :loading="isLoading"
                  :disabled="isLoading"
                  @click="remove"
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

  <UTable :data="data" :columns="columns" :loading="pending" @select="onSelect">
    <template #updatedAt-cell="{ row }">
      <NuxtTime :datetime="row.original.updatedAt" date-style="short" time-style="short" />
    </template>
  </UTable>
</template>
