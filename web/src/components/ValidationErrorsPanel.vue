<script setup lang="ts">
defineProps<{ errors?: { path: string; message: string }[] }>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <p class="panel-title">Validation errors</p>
      <p class="mt-2 text-sm leading-6 text-gray-600">
        Schema validation and required mapping issues appear here.
      </p>
    </div>
    <div v-if="errors?.length" class="space-y-3">
      <div
        v-for="error in errors"
        :key="`${error.path}-${error.message}`"
        class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        <strong>{{ error.path }}</strong
        >: {{ error.message }}
      </div>
    </div>
    <p v-else class="text-sm font-medium text-emerald-600">
      No validation errors.
    </p>
  </section>
</template>
