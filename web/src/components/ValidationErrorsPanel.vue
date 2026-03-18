<script setup lang="ts">
defineProps<{ errors?: { path: string; message: string }[] }>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <p class="panel-title">Validation errors</p>
      <p class="mt-1 text-sm text-slate-400">
        Schema validation and required mapping issues appear here.
      </p>
    </div>
    <div v-if="errors?.length" class="space-y-3">
      <div
        v-for="error in errors"
        :key="`${error.path}-${error.message}`"
        class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
      >
        <strong>{{ error.path }}</strong
        >: {{ error.message }}
      </div>
    </div>
    <p v-else class="text-sm text-emerald-300">No validation errors.</p>
  </section>
</template>
