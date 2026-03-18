<script setup lang="ts">
import TransformEditor from "./TransformEditor.vue";
import type { FieldMapping } from "../types/pipeline";

const model = defineModel<FieldMapping[]>({ required: true });

// addRow grows the mapping table incrementally without imposing a more complex schema graph UI in v1.
const addRow = () => {
  model.value.push({
    from: "",
    expression: "",
    to: "",
    required: false,
    transforms: [],
  });
};
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <p class="panel-title">Field mappings</p>
        <p class="mt-1 text-sm text-slate-400">
          Map source fields into target paths with explicit transforms.
        </p>
      </div>
      <button class="button-primary" type="button" @click="addRow">
        Add row
      </button>
    </div>

    <div class="space-y-4">
      <div
        v-for="(row, index) in model"
        :key="index"
        class="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
      >
        <div class="grid gap-3 lg:grid-cols-[1fr,1fr]">
          <input
            v-model="row.from"
            class="input"
            placeholder="source field/path"
          />
          <input
            v-model="row.to"
            class="input"
            placeholder="target field/path"
          />
          <input
            v-model="row.expression"
            class="input lg:col-span-2"
            placeholder="optional CEL expression, e.g. record.first_name + ' ' + record.last_name"
          />
          <label
            class="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 lg:w-max"
          >
            <input
              v-model="row.required"
              type="checkbox"
              class="rounded border-slate-600 bg-slate-900 text-cyan-400"
            />
            Required
          </label>
        </div>
        <div class="mt-4">
          <TransformEditor v-model="row.transforms" />
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button
            class="button-secondary"
            type="button"
            :disabled="index === 0"
            @click="model.splice(index - 1, 2, model[index], model[index - 1])"
          >
            Move up
          </button>
          <button
            class="button-secondary"
            type="button"
            @click="model.splice(index, 1)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
