<script setup lang="ts">
const props = defineProps<{
  title: string;
  total: number;
  points: { date: string; label: string; value: number }[];
  color: "primary" | "success" | "info";
}>();

const maximum = computed(() => Math.max(0, ...props.points.map((point) => point.value)));
const colors = { primary: "bg-primary", success: "bg-success", info: "bg-info" };
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4' }">
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <h3 class="text-sm font-medium text-muted">{{ title }}</h3>
      <strong class="text-2xl tabular-nums">{{ total.toLocaleString("en") }}</strong>
    </div>
    <div
      v-if="maximum"
      class="h-28 flex items-end gap-1 border-b border-default"
      role="list"
      :aria-label="`${title} over time`"
    >
      <div
        v-for="point in points"
        :key="point.date"
        class="h-full flex flex-1 items-end min-w-0 rounded-t focus-visible:outline-2 focus-visible:outline-primary"
        role="listitem"
        tabindex="0"
        :title="`${point.label}: ${point.value}`"
        :aria-label="`${point.label}: ${point.value}`"
      >
        <div
          class="w-full rounded-t-sm min-h-0.5"
          :class="point.value ? colors[color] : 'bg-muted'"
          :style="{ height: `${(point.value / maximum) * 100}%` }"
        />
      </div>
    </div>
    <div v-else class="h-28 flex items-center justify-center text-sm text-muted">
      No records in this period
    </div>
    <div v-if="points.length" class="flex justify-between gap-3 text-xs text-muted mt-2">
      <span>{{ points[0]!.label }}</span>
      <span v-if="points.length > 1">{{ points[points.length - 1]!.label }}</span>
    </div>
  </UCard>
</template>
