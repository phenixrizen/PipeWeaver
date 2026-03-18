<script setup lang="ts">
import TransformEditor from "@/components/TransformEditor.vue";
import type { FieldMapping } from "@/types/pipeline";

const mappings = defineModel<FieldMapping[]>({ required: true });

// addRow appends a new mapping entry for iterative pipeline design.
function addRow() {
  mappings.value.push({ from: "", to: "", required: false, transforms: [] });
}

// removeRow deletes the selected mapping entry.
function removeRow(index: number) {
  mappings.value.splice(index, 1);
}

// moveRow reorders mappings without introducing drag-and-drop complexity yet.
function moveRow(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= mappings.value.length) {
    return;
  }
  const [entry] = mappings.value.splice(index, 1);
  mappings.value.splice(target, 0, entry);
}
</script>

<template>
  <section class="panel p-5">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-white">Field mappings</h3>
        <p class="mt-1 text-sm text-slate-400">
          Map source paths into the canonical target model.
        </p>
      </div>
      <button type="button" class="btn-primary" @click="addRow">Add row</button>
    </div>
    <div class="space-y-4">
      <div
        v-for="(mapping, index) in mappings"
        :key="index"
        class="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
      >
        <div class="grid gap-3 md:grid-cols-[1fr,1fr,120px]">
          <label>
            <span class="label">Source path</span>
            <input
              v-model="mapping.from"
              class="input"
              placeholder="customer_id"
            />
          </label>
          <label>
            <span class="label">Target path</span>
            <input
              v-model="mapping.to"
              class="input"
              placeholder="customer.id"
            />
          </label>
          <label
            class="flex items-end gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300"
          >
            <input v-model="mapping.required" type="checkbox" />
            Required
          </label>
        </div>
        <div class="mt-4">
          <span class="label">Transforms</span>
          <TransformEditor v-model="mapping.transforms" />
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-secondary"
            @click="moveRow(index, -1)"
          >
            Move up
          </button>
          <button
            type="button"
            class="btn-secondary"
            @click="moveRow(index, 1)"
          >
            Move down
          </button>
          <button type="button" class="btn-secondary" @click="removeRow(index)">
            Remove row
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
