<script setup lang="ts">
defineProps<{ title: string; description: string }>();
</script>

<template>
  <div
    class="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
        PipeWeaver MVP
      </p>
      <h2 class="mt-2 text-3xl font-semibold text-white">{{ title }}</h2>
      <p class="mt-2 max-w-3xl text-sm text-slate-400">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
