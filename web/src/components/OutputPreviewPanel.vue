<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";
import { isTabularFormat, parseTabularPreviewData } from "../lib/schema";
import type { PreviewResult } from "../types/pipeline";

const props = withDefaults(
  defineProps<{
    preview?: PreviewResult;
    format?: string;
  }>(),
  {
    format: "",
  },
);

const previewMode = ref<"raw" | "table">("raw");
const maxTableRows = 100;

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

const rawPreviewText = computed(
  () => props.preview?.encodedOutput || "Run a preview to see transformed output.",
);

const previewLanguage = computed(() => {
  switch (props.format) {
    case "json":
      return "json";
    case "xml":
      return "xml";
    default:
      return "plaintext";
  }
});

const canShowTable = computed(
  () => Boolean(props.preview?.encodedOutput?.trim()) && isTabularFormat(props.format),
);

const tablePreview = computed(() => {
  if (!canShowTable.value) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
    };
  }

  const parsed = parseTabularPreviewData(
    props.format,
    props.preview?.encodedOutput ?? "",
  );

  return {
    headers: parsed.headers,
    rows: parsed.rows.slice(0, maxTableRows),
    totalRows: parsed.rows.length,
  };
});

const hiddenRowCount = computed(() =>
  Math.max((tablePreview.value.totalRows ?? 0) - tablePreview.value.rows.length, 0),
);

watch(
  () => props.format,
  () => {
    previewMode.value = "raw";
  },
);

watch(canShowTable, (value) => {
  if (!value) {
    previewMode.value = "raw";
  }
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
      <div class="flex items-center gap-3">
        <div
          v-if="canShowTable"
          class="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm"
        >
          <button
            class="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            :class="previewMode === 'raw' ? 'bg-sky-500 text-white' : 'text-slate-600'"
            type="button"
            @click="previewMode = 'raw'"
          >
            Raw
          </button>
          <button
            class="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            :class="previewMode === 'table' ? 'bg-sky-500 text-white' : 'text-slate-600'"
            type="button"
            @click="previewMode = 'table'"
          >
            Table
          </button>
        </div>
        <span
          v-if="preview"
          class="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-600"
        >
          Last run {{ formattedDuration }}
        </span>
      </div>
    </div>

    <div
      v-if="previewMode === 'table' && canShowTable"
      class="overflow-hidden rounded-3xl border border-slate-200 bg-white"
    >
      <div v-if="tablePreview.headers.length" class="max-h-[34rem] overflow-auto">
        <table class="min-w-full border-collapse text-left text-sm text-slate-700">
          <thead class="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th
                v-for="header in tablePreview.headers"
                :key="header"
                class="border-b border-slate-200 px-4 py-3 font-semibold"
              >
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in tablePreview.rows"
              :key="`preview-row-${rowIndex}`"
              class="border-b border-slate-100 last:border-b-0"
            >
              <td
                v-for="header in tablePreview.headers"
                :key="`${rowIndex}-${header}`"
                class="px-4 py-3 align-top"
              >
                {{ row[header] || "" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="px-4 py-5 text-sm text-slate-500">
        Run a preview to see transformed output.
      </div>
      <div
        v-if="hiddenRowCount > 0"
        class="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"
      >
        Showing the first {{ tablePreview.rows.length }} of {{ tablePreview.totalRows }} rows.
      </div>
    </div>

    <MonacoCodeEditor
      v-else
      :model-value="rawPreviewText"
      :language="previewLanguage"
      :readonly="true"
      label="Encoded output"
      height="340px"
    />
  </section>
</template>
