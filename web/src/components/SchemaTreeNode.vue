<script setup lang="ts">
import { computed } from "vue";
import AppSelect from "./AppSelect.vue";
import type { SchemaField } from "../types/pipeline";

defineOptions({ name: "SchemaTreeNode" });

const props = defineProps<{
  field: SchemaField;
  nodePath: number[];
  targetPath: string;
  mappedSources: Record<string, string | undefined>;
  sourceDragActive: boolean;
  nodeDragActive: boolean;
  level?: number;
}>();

const emit = defineEmits<{
  "rename-field": [nodePath: number[], value: string];
  "update-field-type": [nodePath: number[], value: string];
  "toggle-required": [nodePath: number[], value: boolean];
  "map-drop": [nodePath: number[]];
  "append-source": [nodePath: number[]];
  "add-child": [nodePath: number[], kind: "leaf" | "object" | "array"];
  "move-field": [nodePath: number[], direction: -1 | 1];
  "remove-field": [nodePath: number[]];
  "node-drag-start": [nodePath: number[]];
  "node-drag-end": [];
  "move-drop": [nodePath: number[], position: "before" | "after" | "inside"];
}>();

const onNameChange = (event: Event) => {
  emit(
    "rename-field",
    props.nodePath,
    (event.target as HTMLInputElement).value,
  );
};

const onTypeChange = (value: string) => {
  emit("update-field-type", props.nodePath, value);
};

const onRequiredChange = (event: Event) => {
  emit(
    "toggle-required",
    props.nodePath,
    (event.target as HTMLInputElement).checked,
  );
};

const forwardRename = (nodePath: number[], value: string) => {
  emit("rename-field", nodePath, value);
};

const forwardType = (nodePath: number[], value: string) => {
  emit("update-field-type", nodePath, value);
};

const forwardRequired = (nodePath: number[], value: boolean) => {
  emit("toggle-required", nodePath, value);
};

const forwardMapDrop = (nodePath: number[]) => {
  emit("map-drop", nodePath);
};

const forwardAppend = (nodePath: number[]) => {
  emit("append-source", nodePath);
};

const forwardAddChild = (
  nodePath: number[],
  kind: "leaf" | "object" | "array",
) => {
  emit("add-child", nodePath, kind);
};

const forwardMove = (nodePath: number[], direction: -1 | 1) => {
  emit("move-field", nodePath, direction);
};

const forwardRemove = (nodePath: number[]) => {
  emit("remove-field", nodePath);
};

const startNodeDrag = () => {
  emit("node-drag-start", props.nodePath);
};

const endNodeDrag = () => {
  emit("node-drag-end");
};

const dropBefore = () => {
  emit("move-drop", props.nodePath, "before");
};

const dropAfter = () => {
  emit("move-drop", props.nodePath, "after");
};

const dropInside = () => {
  emit("move-drop", props.nodePath, "inside");
};

const forwardNodeDragStart = (nodePath: number[]) => {
  emit("node-drag-start", nodePath);
};

const forwardNodeDragEnd = () => {
  emit("node-drag-end");
};

const forwardMoveDrop = (
  nodePath: number[],
  position: "before" | "after" | "inside",
) => {
  emit("move-drop", nodePath, position);
};

const isContainer = computed(
  () => props.field.type === "object" || props.field.type === "array",
);

const showsMappedSourceZone = computed(
  () => !isContainer.value || !(props.field.fields?.length ?? 0),
);
const fieldTypeOptions = ["string", "integer", "number", "boolean", "object", "array"];
</script>

<template>
  <div
    data-testid="schema-node"
    :data-target-path="targetPath"
    class="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm"
    :style="{ marginLeft: `${(level ?? 0) * 16}px` }"
  >
    <div
      v-if="nodeDragActive"
      data-testid="schema-drop-before"
      :data-target-path="targetPath"
      class="mb-3 rounded-2xl border border-dashed px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition"
      :class="
        nodeDragActive
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-slate-50 text-slate-400'
      "
      @dragover.prevent
      @drop.prevent="dropBefore"
    >
      Drop before
    </div>

    <div class="grid gap-3 lg:grid-cols-[auto,1.2fr,0.8fr,auto,auto]">
      <div class="flex items-start">
        <div
          data-testid="schema-node-drag-handle"
          :data-target-path="targetPath"
          class="inline-flex cursor-grab select-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm active:cursor-grabbing"
          draggable="true"
          @dragstart="startNodeDrag"
          @dragend="endNodeDrag"
        >
          Move
        </div>
      </div>
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Field name</span>
        <input
          :value="field.name"
          class="input"
          placeholder="target field"
          @change="onNameChange"
        />
      </label>
      <label class="space-y-2 text-sm font-medium text-slate-700">
        <span>Type</span>
        <AppSelect
          :model-value="field.type"
          :options="fieldTypeOptions"
          @update:modelValue="onTypeChange(String($event))"
        />
      </label>
      <label
        class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
      >
        <input
          :checked="field.required"
          type="checkbox"
          class="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-200"
          @change="onRequiredChange"
        />
        Required
      </label>
      <div class="flex flex-wrap items-end justify-end gap-2">
        <button
          class="button-secondary"
          type="button"
          @click="emit('move-field', nodePath, -1)"
        >
          Up
        </button>
        <button
          class="button-secondary"
          type="button"
          @click="emit('move-field', nodePath, 1)"
        >
          Down
        </button>
        <button
          class="button-secondary"
          type="button"
          @click="emit('remove-field', nodePath)"
        >
          Delete
        </button>
      </div>
    </div>

    <div class="mt-3 grid gap-3 xl:grid-cols-[1fr,1fr]">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Target path
        </p>
        <p class="mt-2 text-sm font-semibold text-slate-900">
          {{ targetPath }}
        </p>
      </div>

      <div
        v-if="showsMappedSourceZone"
        data-testid="schema-leaf-drop-zone"
        :data-target-path="targetPath"
        class="rounded-2xl border border-dashed bg-[linear-gradient(135deg,_rgba(14,165,233,0.08),_rgba(255,255,255,1))] px-4 py-3 transition"
        :class="
          sourceDragActive
            ? 'border-sky-300 shadow-sm'
            : 'border-slate-300'
        "
        @dragover.prevent
        @drop.prevent="emit('map-drop', nodePath)"
      >
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Mapped source
        </p>
        <p class="mt-2 text-sm font-medium text-slate-900">
          {{
            mappedSources[targetPath] || "Drop a source field here to map it."
          }}
        </p>
      </div>
    </div>

    <div v-if="isContainer" class="mt-4 space-y-3">
      <div class="flex flex-wrap gap-2">
        <button
          class="button-secondary"
          type="button"
          @click="emit('add-child', nodePath, 'leaf')"
        >
          Add field
        </button>
        <button
          class="button-secondary"
          type="button"
          @click="emit('add-child', nodePath, 'object')"
        >
          Add object
        </button>
        <button
          class="button-secondary"
          type="button"
          @click="emit('add-child', nodePath, 'array')"
        >
          Add array
        </button>
      </div>

      <div
        data-testid="schema-drop-inside"
        :data-target-path="targetPath"
        class="rounded-2xl border border-dashed bg-[linear-gradient(135deg,_rgba(14,165,233,0.06),_rgba(255,255,255,1))] px-4 py-3 transition"
        :class="
          sourceDragActive || nodeDragActive
            ? 'border-sky-300 shadow-sm'
            : 'border-slate-300'
        "
        @dragover.prevent
        @drop.prevent="nodeDragActive ? dropInside() : emit('append-source', nodePath)"
      >
        <p class="text-sm font-semibold text-slate-900">
          {{
            nodeDragActive
              ? "Drop a target node here to move it into this object."
              : "Drop a source field here to create a child target and mapping."
          }}
        </p>
      </div>

      <div v-if="field.fields?.length" class="space-y-3">
        <SchemaTreeNode
          v-for="(child, childIndex) in field.fields"
          :key="`${targetPath}.${child.name}.${childIndex}`"
          :field="child"
          :node-path="[...nodePath, childIndex]"
          :target-path="`${targetPath}.${child.name}`"
          :mapped-sources="mappedSources"
          :source-drag-active="sourceDragActive"
          :node-drag-active="nodeDragActive"
          :level="(level ?? 0) + 1"
          @rename-field="forwardRename"
          @update-field-type="forwardType"
          @toggle-required="forwardRequired"
          @map-drop="forwardMapDrop"
          @append-source="forwardAppend"
          @add-child="forwardAddChild"
          @move-field="forwardMove"
          @remove-field="forwardRemove"
          @node-drag-start="forwardNodeDragStart"
          @node-drag-end="forwardNodeDragEnd"
          @move-drop="forwardMoveDrop"
        />
      </div>
      <p v-else class="text-sm text-slate-500">
        No child fields yet.
      </p>
    </div>

    <div
      v-if="nodeDragActive"
      data-testid="schema-drop-after"
      :data-target-path="targetPath"
      class="mt-3 rounded-2xl border border-dashed px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition"
      :class="
        nodeDragActive
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-slate-50 text-slate-400'
      "
      @dragover.prevent
      @drop.prevent="dropAfter"
    >
      Drop after
    </div>
  </div>
</template>
