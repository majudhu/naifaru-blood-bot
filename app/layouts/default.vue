<script setup lang="ts">
import type { NavigationMenuItem, SlideoverProps } from "@nuxt/ui";

const { clear } = useUserSession();
const { user } = useUserSession();

const open = ref(true);

async function logout() {
  await clear();
  await navigateTo("/login");
}

function onSelect() {
  if (matchMedia("(max-width: 1024px)").matches) open.value = false;
}

const items = computed<NavigationMenuItem[]>(() => [
  {
    label: "Home",
    icon: "i-lucide-house",
    to: "/",
    onSelect,
  },
  {
    label: "Requests",
    icon: "i-lucide-inbox",
    badge: "0",
    to: "/requests",
    onSelect,
  },
  ...(user.value?.role === "admin"
    ? [
        {
          label: "Staff",
          icon: "i-lucide-users",
          to: "/staff",
          onSelect,
        },
      ]
    : []),
]);

const menu: SlideoverProps = {
  title: "Menu",
};
</script>

<template>
  <div class="lg:flex">
    <USidebar title="Naifaru Blood Donors" v-model:open="open">
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        :ui="{ link: 'p-1.5 overflow-hidden' }"
      />
      <UButton color="error" @click="logout" variant="soft" leading-icon="i-lucide-log-out"
        >Logout</UButton
      >
    </USidebar>

    <header class="flex items-center gap-4 p-4 lg:hidden">
      <UButton
        icon="i-lucide-panel-left"
        color="neutral"
        variant="ghost"
        aria-label="Toggle sidebar"
        class="lg:hidden"
        @click="open = !open"
      />
      <h1 class="text-xl font-semibold tracking-normal text-gray-950 dark:text-white">
        Naifaru Blood Donors
      </h1>
    </header>

    <main class="flex-1 p-4">
      <slot />
    </main>
  </div>
</template>
