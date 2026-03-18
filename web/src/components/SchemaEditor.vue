<script setup lang="ts">
import { computed } from "vue";
import MonacoCodeEditor from "./MonacoCodeEditor.vue";
import type { SchemaDefinition } from "../types/pipeline";

const model = defineModel<SchemaDefinition | undefined>({ required: true });

const serializedSchema = computed({
  get: () =>
    JSON.stringify(model.value ?? { type: "object", fields: [] }, null, 2),
  set: (value: string) => {
    model.value = JSON.parse(
      value || '{"type":"object","fields":[]}',
    ) as SchemaDefinition;
  },
});
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4">
      <p class="panel-title">Target schema</p>
      <p class="mt-2 text-sm leading-6 text-gray-600">
        Keep schema definitions explicit for validation and future AI-assisted
        mapping.
      </p>
    </div>
    <MonacoCodeEditor
      v-model="serializedSchema"
      language="json"
      height="320px"
    />
  </section>
</template>
