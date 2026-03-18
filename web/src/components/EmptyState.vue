<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="panel p-10 text-center">
    <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
    <p class="mt-2 text-sm text-slate-400">{{ description }}</p>
    <div class="mt-5">
      <slot />
    </div>
  </div>
</template>
