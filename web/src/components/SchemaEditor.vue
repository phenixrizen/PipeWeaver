<script setup lang="ts">
import type { SchemaDefinition } from "../types/pipeline";

const model = defineModel<SchemaDefinition | undefined>({ required: true });

// updateSchema keeps the text editor flexible while still normalizing empty input into a valid schema object.
const updateSchema = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  model.value = JSON.parse(
    value || '{"type":"object","fields":[]}',
  ) as SchemaDefinition;
};
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
    <textarea
      class="input min-h-48 font-mono text-xs"
      :value="JSON.stringify(model, null, 2)"
      @change="updateSchema"
    />
  </section>
</template>
