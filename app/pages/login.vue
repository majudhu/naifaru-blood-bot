<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";

definePageMeta({ layout: false });

const { loggedIn, fetch: refreshSession } = useUserSession();

if (loggedIn.value) navigateTo("/");

const state = reactive({ username: "", password: "" });

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  await $fetch("/api/login", { method: "POST", body: e.data });
  await refreshSession();
  await navigateTo("/");
}
</script>

<template>
  <UForm :state="state" class="flex flex-col gap-4 max-w-sm mx-auto p-5 sm:p-10" @submit="onSubmit">
    <UFormField label="Username">
      <UInput v-model="state.username" class="w-full" required minlength="3" maxlength="40" />
    </UFormField>

    <UFormField label="Password">
      <UInput
        v-model="state.password"
        type="password"
        class="w-full"
        required
        minlength="8"
        maxlength="128"
      />
    </UFormField>

    <UButton class="w-fit px-10" type="submit">Login</UButton>
  </UForm>
</template>
