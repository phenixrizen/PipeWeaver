<script setup lang="ts">
import { computed, ref } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";

const props = withDefaults(
  defineProps<{
    format?: string;
    title?: string;
    description?: string;
    dropHint?: string;
    idleBadge?: string;
  }>(),
  {
    title: "Sample payload",
    description:
      "Use realistic request payloads to exercise the parser, mapping runtime, and the generated HTTP endpoint.",
    dropHint:
      "Drag a `.json`, `.xml`, `.csv`, or text file onto this card to load it into the editor and auto-detect the format.",
    idleBadge: "Raw request body",
  },
);
const emit = defineEmits<{ "detected-format": [format: string] }>();
const model = defineModel<string>({ required: true });
const isDragActive = ref(false);
const dropError = ref("");
const detectedFormat = ref("");

const isOutputEditor = computed(() =>
  props.title.toLowerCase().includes("output"),
);

const emptyStateTitle = computed(() =>
  isOutputEditor.value ? "No sample output loaded yet" : "No sample payload loaded yet",
);

const emptyStateDescription = computed(() => {
  if (!props.format) {
    return isOutputEditor.value
      ? "Select a target format above, then paste a representative output sample or drop a file here to lock the expected response contract."
      : "Select a source format above, then paste a representative payload or drop a file here so PipeWeaver can parse the incoming shape correctly.";
  }

  const formatLabel = props.format.toUpperCase();
  return isOutputEditor.value
    ? `Paste representative ${formatLabel} output here or drop a file to ground the target schema before you generate mappings.`
    : `Paste representative ${formatLabel} input here or drop a file to exercise parsing, mapping, and preview behavior.`;
});

const language = computed(() => {
  switch (props.format) {
    case "json":
      return "json";
    case "xml":
      return "xml";
    case "csv":
    case "tsv":
    case "pipe":
      return "plaintext";
    default:
      return "plaintext";
  }
});

const handleDragEnter = () => {
  isDragActive.value = true;
};

const handleDragLeave = () => {
  isDragActive.value = false;
};

const detectFormatFromFileName = (fileName?: string) => {
  const normalizedName = fileName?.toLowerCase() ?? "";

  if (normalizedName.endsWith(".json")) {
    return "json";
  }
  if (normalizedName.endsWith(".xml")) {
    return "xml";
  }
  if (normalizedName.endsWith(".tsv")) {
    return "tsv";
  }
  if (normalizedName.endsWith(".psv") || normalizedName.endsWith(".pipe")) {
    return "pipe";
  }
  if (normalizedName.endsWith(".csv")) {
    return "csv";
  }

  return "";
};

const detectFormatFromContent = (payload: string) => {
  const trimmed = payload.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }

  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return "xml";
  }

  const headerLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  if (headerLine.includes("\t")) {
    return "tsv";
  }

  const pipeCount = (headerLine.match(/\|/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;

  if (pipeCount >= 1 && pipeCount >= commaCount) {
    return "pipe";
  }

  if (commaCount >= 1) {
    return "csv";
  }

  return "";
};

const applyDetectedFormat = (payload: string, fileName?: string) => {
  const nextFormat =
    detectFormatFromFileName(fileName) || detectFormatFromContent(payload);

  detectedFormat.value = nextFormat;
  if (nextFormat) {
    emit("detected-format", nextFormat);
  }
};

const handleDrop = async (event: DragEvent) => {
  isDragActive.value = false;
  dropError.value = "";

  try {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const payload = await file.text();
      model.value = payload;
      applyDetectedFormat(payload, file.name);
      return;
    }

    const textPayload = event.dataTransfer?.getData("text/plain") ?? "";
    if (textPayload) {
      model.value = textPayload;
      applyDetectedFormat(textPayload);
    }
  } catch (error) {
    dropError.value =
      error instanceof Error
        ? error.message
        : "Failed to read the dropped payload file.";
  }
};
</script>

<template>
  <section
    data-testid="sample-payload-drop-zone"
    class="panel p-5 transition"
    :class="isDragActive ? 'border-sky-300 shadow-lg shadow-sky-100' : ''"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragEnter"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="panel-title">{{ props.title }}</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          {{ props.description }}
        </p>
        <p class="mt-2 text-xs font-medium text-sky-700">
          {{ props.dropHint }}
        </p>
      </div>
      <span
        class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
      >
        {{
          isDragActive
            ? "Drop file to load"
            : detectedFormat
              ? `Detected ${detectedFormat}`
              : props.idleBadge
        }}
      </span>
    </div>
    <div
      v-if="dropError"
      class="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ dropError }}
    </div>
    <div
      v-else-if="!model.trim()"
      data-testid="sample-payload-empty-state"
      class="mb-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-4 py-4 text-sm text-sky-950"
    >
      <p class="font-semibold text-sky-900">
        {{ emptyStateTitle }}
      </p>
      <p class="mt-1 leading-6 text-sky-900">
        {{ emptyStateDescription }}
      </p>
    </div>
    <MonacoCodeEditor v-model="model" :language="language" height="260px" />
  </section>
</template>
