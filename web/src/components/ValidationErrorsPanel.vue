<script setup lang="ts">
import type { PreviewResult } from "@/types/pipeline";

defineProps<{
  preview: PreviewResult | null;
}>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-white">Validation errors</h3>
      <p class="mt-1 text-sm text-slate-400">
        Schema mismatches are surfaced here after preview execution.
      </p>
    </div>
    <div
      v-if="preview?.validations && Object.keys(preview.validations).length > 0"
      class="space-y-3 text-sm text-rose-300"
    >
      <div
        v-for="(errors, recordIndex) in preview.validations"
        :key="recordIndex"
        class="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3"
      >
        <p class="font-semibold text-rose-200">Record {{ recordIndex }}</p>
        <ul class="mt-2 list-disc pl-5">
          <li
            v-for="error in errors"
            :key="`${recordIndex}-${error.path}-${error.message}`"
          >
            {{ error.path }} — {{ error.message }}
          </li>
        </ul>
      </div>
    </div>
    <p v-else class="text-sm text-emerald-300">
      No validation errors for the latest preview.
    </p>
  </section>
</template>
