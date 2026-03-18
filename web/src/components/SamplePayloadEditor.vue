<script setup lang="ts">
import { computed } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";

const props = defineProps<{ format?: string }>();
const model = defineModel<string>({ required: true });

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
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="panel-title">Sample payload</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Use realistic request payloads to exercise the parser, mapping
          runtime, and the generated HTTP endpoint.
        </p>
      </div>
      <span
        class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
      >
        Raw request body
      </span>
    </div>
    <MonacoCodeEditor v-model="model" :language="language" height="260px" />
  </section>
</template>
