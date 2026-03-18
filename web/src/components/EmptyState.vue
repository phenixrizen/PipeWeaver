<script setup lang="ts">
defineProps<{ title: string; message: string }>();
</script>

<template>
  <div class="panel flex flex-col items-start gap-3 p-8">
    <div
      class="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400"
    >
      {{ title }}
    </div>
    <p class="text-sm text-slate-400">{{ message }}</p>
    <slot />
  </div>
</template>
