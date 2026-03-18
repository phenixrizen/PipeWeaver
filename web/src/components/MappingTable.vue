<script setup lang="ts">
import { computed } from "vue";
import TransformEditor from "./TransformEditor.vue";
import { validateExpression } from "../lib/cel";
import type { FieldMapping } from "../types/pipeline";

const props = defineProps<{ sourceFormat: string; samplePayload: string }>();
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

// expressionStates keeps the browser-side CEL validation aligned with the current sample payload and source format.
const expressionStates = computed(() =>
  model.value.map((row) =>
    validateExpression(row.expression, props.samplePayload, props.sourceFormat),
  ),
);
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="panel-title">Field mappings</p>
        <p class="mt-2 text-sm leading-6 text-gray-600">
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
        class="rounded-2xl border border-gray-200 bg-gray-50 p-4"
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
          <div class="space-y-2 lg:col-span-2">
            <input
              v-model="row.expression"
              class="input"
              placeholder="optional CEL expression, e.g. record.first_name + ' ' + record.last_name"
            />
            <p
              v-if="row.expression"
              :class="
                expressionStates[index]?.valid
                  ? 'text-emerald-600'
                  : 'text-red-600'
              "
              class="text-xs font-medium"
            >
              {{ expressionStates[index]?.message }}
            </p>
          </div>
          <label
            class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 lg:w-max"
          >
            <input
              v-model="row.required"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-violet-500 focus:ring-violet-200"
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
