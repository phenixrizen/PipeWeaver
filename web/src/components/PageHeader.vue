<script setup lang="ts">
defineProps<{ title: string; description: string }>();
</script>

<template>
  <div
    class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
  >
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-500"
      >
        PipeWeaver workspace
      </p>
      <h2 class="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {{ title }}
      </h2>
      <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        {{ description }}
      </p>
    </div>
    <slot />
  </div>
</template>
