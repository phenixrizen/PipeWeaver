<script setup lang="ts">
import type { Transform } from "@/types/pipeline";

const transforms = defineModel<Transform[]>({ required: true });

const available = [
  "trim",
  "upper",
  "lower",
  "to_int",
  "to_float",
  "to_bool",
  "default",
  "concat",
];

// addTransform appends a minimal transform so users can fill in details inline.
function addTransform() {
  transforms.value.push({ type: "trim" });
}

// removeTransform keeps the editor list compact.
function removeTransform(index: number) {
  transforms.value.splice(index, 1);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(transform, index) in transforms"
      :key="index"
      class="rounded-xl border border-slate-800 bg-slate-950/60 p-2"
    >
      <div class="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
        <select v-model="transform.type" class="input">
          <option v-for="option in available" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
        <input
          v-model="transform.value"
          class="input"
          :placeholder="
            transform.type === 'default' ? 'Default value' : 'Optional value'
          "
        />
        <button
          type="button"
          class="btn-secondary"
          @click="removeTransform(index)"
        >
          Remove
        </button>
      </div>
    </div>
    <button type="button" class="btn-secondary" @click="addTransform">
      Add transform
    </button>
  </div>
</template>
