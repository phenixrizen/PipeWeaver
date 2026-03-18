<script setup lang="ts">
import { computed, ref } from "vue";
import TransformEditor from "./TransformEditor.vue";
import { validateExpression } from "../lib/cel";
import type { FieldMapping, SchemaDefinition } from "../types/pipeline";

const props = defineProps<{
  sourceFormat: string;
  samplePayload: string;
  targetSchema?: SchemaDefinition;
}>();
const model = defineModel<FieldMapping[]>({ required: true });

const draggedSource = ref<string | null>(null);

const addRow = () => {
  model.value.push({
    from: "",
    expression: "",
    to: "",
    required: false,
    transforms: [],
  });
};

const expressionStates = computed(() =>
  model.value.map((row) =>
    validateExpression(row.expression, props.samplePayload, props.sourceFormat),
  ),
);

const csvColumns = computed(() => {
  if (!["csv", "tsv", "pipe"].includes(props.sourceFormat)) {
    return [];
  }

  const delimiter =
    props.sourceFormat === "tsv"
      ? "\t"
      : props.sourceFormat === "pipe"
        ? "|"
        : ",";
  const headerLine = props.samplePayload.split(/\r?\n/, 1)[0]?.trim();
  if (!headerLine) {
    return [];
  }

  return headerLine
    .split(delimiter)
    .map((column) => column.trim())
    .filter(Boolean);
});

const flattenSchemaFields = (
  fields: SchemaDefinition["fields"] | undefined,
  prefix = "",
): string[] => {
  if (!fields?.length) {
    return [];
  }

  return fields.flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.type === "object" && field.fields?.length) {
      return flattenSchemaFields(field.fields, path);
    }
    return [path];
  });
};

const targetPaths = computed(() =>
  flattenSchemaFields(props.targetSchema?.fields),
);

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const scoreMatch = (source: string, target: string) => {
  const sourceTokens = normalizeToken(source);
  const targetTokens = normalizeToken(target.split(".").pop() || target);
  const overlap = sourceTokens.filter((token) =>
    targetTokens.includes(token),
  ).length;
  if (overlap === 0) {
    return 0;
  }
  const union = new Set([...sourceTokens, ...targetTokens]).size;
  return overlap / union;
};

const upsertMapping = (source: string, target: string) => {
  const existing = model.value.find((row) => row.to === target);
  if (existing) {
    existing.from = source;
    existing.expression = "";
    if (!existing.transforms.length) {
      existing.transforms = [{ type: "trim" }];
    }
    return;
  }

  model.value.push({
    from: source,
    to: target,
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
};

const handleDrop = (target: string) => {
  if (!draggedSource.value) {
    return;
  }
  upsertMapping(draggedSource.value, target);
  draggedSource.value = null;
};

const applyAISuggestions = () => {
  targetPaths.value.forEach((target) => {
    const bestMatch = csvColumns.value
      .map((source) => ({ source, score: scoreMatch(source, target) }))
      .sort((left, right) => right.score - left.score)[0];

    if (bestMatch && bestMatch.score >= 0.34) {
      upsertMapping(bestMatch.source, target);
    }
  });
};
</script>

<template>
  <section class="panel p-5">
    <div
      class="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
    >
      <div>
        <p class="panel-title">Field mappings</p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Map source fields into target paths with explicit transforms, or use
          drag-and-drop AI assist for CSV-style payloads.
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="csvColumns.length && targetPaths.length"
          class="button-secondary"
          type="button"
          @click="applyAISuggestions"
        >
          AI suggest mappings
        </button>
        <button class="button-primary" type="button" @click="addRow">
          Add row
        </button>
      </div>
    </div>

    <div
      v-if="csvColumns.length && targetPaths.length"
      class="mb-6 grid gap-4 xl:grid-cols-[0.95fr,1.05fr]"
    >
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">CSV columns</p>
          <span
            class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500"
          >
            Drag from here
          </span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="column in csvColumns"
            :key="column"
            class="rounded-full border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            type="button"
            draggable="true"
            @dragstart="draggedSource = column"
            @dragend="draggedSource = null"
          >
            {{ column }}
          </button>
        </div>
      </div>

      <div
        class="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,_rgba(139,92,246,0.06),_rgba(255,255,255,1))] p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-slate-900">
            Output schema targets
          </p>
          <span
            class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500"
          >
            Drop onto a target
          </span>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <div
            v-for="target in targetPaths"
            :key="target"
            class="rounded-2xl border border-dashed border-slate-300 bg-white p-4 transition"
            :class="draggedSource ? 'border-violet-300 shadow-sm' : ''"
            @dragover.prevent
            @drop.prevent="handleDrop(target)"
          >
            <p
              class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
            >
              target path
            </p>
            <p class="mt-2 text-sm font-semibold text-slate-900">
              {{ target }}
            </p>
            <p class="mt-2 text-xs text-slate-500">
              {{
                model.find((row) => row.to === target)?.from ||
                "Awaiting mapped source column"
              }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div
        v-for="(row, index) in model"
        :key="index"
        class="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
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
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 lg:w-max"
          >
            <input
              v-model="row.required"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-violet-500 focus:ring-violet-200"
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
