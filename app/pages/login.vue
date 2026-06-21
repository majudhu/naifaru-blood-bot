<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import { FetchError } from "ofetch";

definePageMeta({ layout: false });

const { loggedIn, fetch: refreshSession } = useUserSession();

if (loggedIn.value) navigateTo("/");

const state = reactive({ username: "", password: "" });
const errorMessage = ref("");
const isLoading = ref(false);

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  errorMessage.value = "";
  isLoading.value = true;

  try {
    await $fetch("/api/login", { method: "POST", body: e.data });
    await refreshSession();
    await navigateTo("/");
  } catch (error) {
    const statusCode = (error as FetchError).statusCode ?? (error as FetchError).status;
    errorMessage.value =
      statusCode === 401
        ? "Incorrect username or password."
        : "Unable to log in right now. Please try again.";
  }
  isLoading.value = false;
}
</script>

<template>
  <UForm :state="state" class="flex flex-col gap-4 max-w-sm mx-auto p-5 sm:p-10" @submit="onSubmit">
    <UFormField name="username" label="Username">
      <UInput v-model="state.username" class="w-full" required minlength="3" maxlength="40" />
    </UFormField>

    <UFormField name="password" label="Password">
      <UInput
        v-model="state.password"
        type="password"
        class="w-full"
        required
        minlength="8"
        maxlength="128"
      />
    </UFormField>

    <UButton class="w-fit px-10" type="submit" :loading="isLoading" :disabled="isLoading">
      Login
    </UButton>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Login failed"
      :description="errorMessage"
      role="alert"
    />
  </UForm>
</template>
