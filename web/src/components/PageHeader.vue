<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div
    class="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between"
  >
    <div>
      <h2 class="text-3xl font-semibold text-white">{{ title }}</h2>
      <p class="mt-1 text-sm text-slate-400">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
