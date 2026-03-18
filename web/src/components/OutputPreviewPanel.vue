<script setup lang="ts">
import type { PreviewResult } from "../types/pipeline";

defineProps<{ preview?: PreviewResult }>();
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <p class="panel-title">Preview output</p>
        <p class="mt-1 text-sm text-slate-400">
          Inspect transformed output and runtime metadata.
        </p>
      </div>
      <span
        v-if="preview"
        class="rounded-full border border-cyan-400/40 px-3 py-1 text-xs text-cyan-300"
      >
        {{ preview.durationMs }} ms
      </span>
    </div>
    <pre
      class="min-h-56 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-200"
      >{{
        preview?.encodedOutput || "Run a preview to see transformed output."
      }}</pre
    >
  </section>
</template>
