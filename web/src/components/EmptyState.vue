<script setup lang="ts">
defineProps<{ title: string; message: string }>();
</script>

<template>
  <div class="panel flex flex-col items-start gap-4 p-8">
    <div
      class="rounded-2xl bg-sky-50 px-4 py-2 text-sm font-medium text-sky-600"
    >
      {{ title }}
    </div>
    <p class="max-w-2xl text-sm leading-6 text-gray-600">{{ message }}</p>
    <slot />
  </div>
</template>
