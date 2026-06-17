<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { clear, user } = useUserSession();

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
    label: "Dashboard",
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
</script>

<template>
  <div class="lg:flex">
    <USidebar title="Naifaru Blood Donors" v-model:open="open">
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        :ui="{ link: 'p-1.5 overflow-hidden' }"
      />
      <UBadge color="neutral" variant="subtle" size="lg" icon="i-lucide-user">
        {{ user?.name }}
      </UBadge>
      <UButton color="error" @click="logout" variant="soft" leading-icon="i-lucide-log-out">
        Logout
      </UButton>
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
      <h1 class="text-xl font-semibold pb-4">Naifaru Blood Donors</h1>
    </header>

    <main class="flex-1 p-4">
      <slot />
    </main>
  </div>
</template>
