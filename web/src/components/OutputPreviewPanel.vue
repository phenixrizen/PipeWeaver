<script setup lang="ts">
import { computed } from "vue";
import type { PreviewResult } from "../types/pipeline";

const props = defineProps<{ preview?: PreviewResult }>();

const formattedDuration = computed(() => {
  if (!props.preview) {
    return "";
  }

  if (props.preview.durationMs < 1) {
    return "<1 ms";
  }

  if (props.preview.durationMs < 1000) {
    return `${Math.round(props.preview.durationMs)} ms`;
  }

  return `${(props.preview.durationMs / 1000).toFixed(2)} s`;
});
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
        Last run {{ formattedDuration }}
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
