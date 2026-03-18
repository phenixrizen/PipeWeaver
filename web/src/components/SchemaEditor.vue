<script setup lang="ts">
import type { SchemaDefinition } from "@/types/pipeline";

const schema = defineModel<SchemaDefinition | undefined>({ required: true });

// addField appends a basic field definition so validation can evolve incrementally.
function addField() {
  if (!schema.value) {
    schema.value = { name: "target-schema", fields: [] };
  }
  schema.value.fields.push({
    name: "",
    path: "",
    type: "string",
    required: false,
  });
}
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-white">Target schema</h3>
        <p class="mt-1 text-sm text-slate-400">
          Define explicit fields for validation and future AI-assisted mapping.
        </p>
      </div>
      <button type="button" class="btn-secondary" @click="addField">
        Add field
      </button>
    </div>
    <div v-if="schema" class="space-y-3">
      <div
        v-for="(field, index) in schema.fields"
        :key="index"
        class="grid gap-3 md:grid-cols-[1fr,1fr,160px,120px]"
      >
        <input v-model="field.name" class="input" placeholder="Field name" />
        <input v-model="field.path" class="input" placeholder="customer.id" />
        <select v-model="field.type" class="input">
          <option>string</option>
          <option>integer</option>
          <option>number</option>
          <option>boolean</option>
          <option>object</option>
        </select>
        <label
          class="flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300"
        >
          <input v-model="field.required" type="checkbox" /> Required
        </label>
      </div>
    </div>
    <p v-else class="text-sm text-slate-500">No schema defined yet.</p>
  </section>
</template>
