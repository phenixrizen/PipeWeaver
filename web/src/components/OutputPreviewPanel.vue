<script setup lang="ts">
import type { PreviewResult } from "@/types/pipeline";

defineProps<{
  preview: PreviewResult | null;
}>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-white">Preview output</h3>
        <p class="mt-1 text-sm text-slate-400">
          Inspect transformed output and execution metadata.
        </p>
      </div>
      <span
        v-if="preview"
        class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
      >
        {{ preview.recordCount }} record(s) · {{ preview.durationMs }}ms
      </span>
    </div>
    <pre
      class="min-h-[240px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200"
      >{{ preview?.output ?? "Run a preview to see transformed output." }}</pre
    >
  </section>
</template>
