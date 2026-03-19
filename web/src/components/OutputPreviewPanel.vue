<script setup lang="ts">
import type { PreviewResult } from "../types/pipeline";

defineProps<{ preview?: PreviewResult }>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="panel-title">Preview output</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Inspect transformed output and runtime metadata.
        </p>
      </div>
      <span
        v-if="preview"
        class="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-600"
      >
        {{ preview.durationMs }} ms
      </span>
    </div>
    <pre
      class="min-h-56 overflow-auto rounded-3xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100"
      >{{
        preview?.encodedOutput || "Run a preview to see transformed output."
      }}</pre
    >
  </section>
</template>
