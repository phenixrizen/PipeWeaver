<script setup lang="ts">
import type { Transform } from "../types/pipeline";

const model = defineModel<Transform[]>({ required: true });
const transformOptions = [
  "trim",
  "upper",
  "lower",
  "to_int",
  "to_float",
  "to_bool",
  "default",
  "concat",
  "conditional",
  "date_parse",
];

// addTransform keeps the UX lightweight while still exposing the backend transform catalog.
const addTransform = () => {
  model.value.push({ type: "trim" });
};
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(transform, index) in model"
      :key="index"
      class="rounded-xl border border-slate-700 bg-slate-950/50 p-3"
    >
      <div class="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
        <select v-model="transform.type" class="input">
          <option
            v-for="option in transformOptions"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>
        <input
          v-model="transform.value"
          class="input"
          placeholder="Value / delimiter / default"
        />
        <button
          class="button-secondary"
          type="button"
          @click="model.splice(index, 1)"
        >
          Remove
        </button>
      </div>
    </div>
    <button class="button-secondary w-full" type="button" @click="addTransform">
      Add transform
    </button>
  </div>
</template>
