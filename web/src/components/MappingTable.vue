<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppSelect from "./AppSelect.vue";
import FieldMappingBrowser from "./FieldMappingBrowser.vue";
import TransformEditor from "./TransformEditor.vue";
import { validateExpression } from "../lib/cel";
import {
  applyResolutionMapping,
  applyHighConfidenceSuggestedMappings,
  describeSourceFieldPath,
  flattenSchemaLeafOptions,
  flattenSchemaLeafPaths,
  inferSourceFields,
  rankTargetMatches,
  upsertMapping,
  type SourceFieldOption,
} from "../lib/schema";
import type { FieldBrowserTargetRow } from "../lib/field-browser";
import type { FieldMapping, SchemaDefinition } from "../types/pipeline";

const props = defineProps<{
  sourceFormat: string;
  samplePayload: string;
  targetSchema?: SchemaDefinition;
}>();
const model = defineModel<FieldMapping[]>({ required: true });
const rowDriverPath = defineModel<string | undefined>("rowDriverPath");

const draggedSource = ref<string | null>(null);
const selectedSource = ref<string | null>(null);
const focusedTarget = ref<string | null>(null);
const browserRef = ref<{ scrollToTarget: (targetPath: string) => void } | null>(
  null,
);
const detailCardRefs = new Map<string, HTMLElement>();
const repeatModeOptions = computed(() => [
  { value: "", label: "inherit" },
  { value: "preserve", label: "preserve" },
  ...(props.sourceFormat !== "xml" ? [{ value: "explode", label: "explode" }] : []),
]);

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

const sourceFields = computed(() =>
  inferSourceFields(props.sourceFormat, props.samplePayload),
);

const sourceFieldLookup = computed<Record<string, SourceFieldOption>>(() =>
  Object.fromEntries(
    sourceFields.value.map((field) => [field.path, field]),
  ),
);

const targetPaths = computed(() =>
  flattenSchemaLeafPaths(props.targetSchema?.fields),
);

const targetFieldOptions = computed(() =>
  flattenSchemaLeafOptions(props.targetSchema?.fields),
);

const targetResolutions = computed(() =>
  rankTargetMatches(sourceFields.value, targetFieldOptions.value),
);

const resolutionLookup = computed<Record<string, (typeof targetResolutions.value)[number]>>(
  () =>
    Object.fromEntries(
      targetResolutions.value.map((resolution) => [resolution.target, resolution]),
    ) as Record<string, (typeof targetResolutions.value)[number]>,
);

const targetRows = computed<FieldBrowserTargetRow[]>(() =>
  targetFieldOptions.value.map((target) => {
    const resolution = resolutionLookup.value[target.path];
    const mappedRow = model.value.find((row) => row.to === target.path);
    const mappedSource =
      mappedRow?.from?.trim() ||
      (mappedRow?.expression?.trim() ? "CEL expression" : undefined);
    const isMapped = Boolean(mappedSource);

    return {
      path: target.path,
      type: target.type,
      mappedSource,
      suggestedSource: isMapped ? undefined : resolution?.suggestedSource,
      status: isMapped
        ? "mapped"
        : resolution?.suggestedSource
          ? "suggested"
          : "unmatched",
    };
  }),
);

const currentSourcePath = () => draggedSource.value ?? selectedSource.value;

const lookupSourceField = (path?: string) => {
  if (!path) {
    return undefined;
  }

  return (
    sourceFieldLookup.value[path] ??
    ({
      ...describeSourceFieldPath(path),
      observedIndexCount: 0,
    } as SourceFieldOption)
  );
};

const repeatBranchForRow = (row: FieldMapping) =>
  lookupSourceField(row.from)?.repeatBranchPath;

const setDetailCardRef = (targetPath: string, element: Element | null) => {
  if (!(element instanceof HTMLElement) || !targetPath) {
    if (targetPath) {
      detailCardRefs.delete(targetPath);
    }
    return;
  }
  detailCardRefs.set(targetPath, element);
};

const ensureMappingRow = (targetPath: string) => {
  const existing = model.value.find((row) => row.to === targetPath);
  if (existing) {
    return existing;
  }

  const created: FieldMapping = {
    from: "",
    to: targetPath,
    required: false,
    expression: "",
    transforms: [],
  };
  model.value.push(created);
  return created;
};

const focusDetailCard = async (targetPath: string) => {
  if (!targetPath) {
    return;
  }

  focusedTarget.value = targetPath;
  await nextTick();
  detailCardRefs.get(targetPath)?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
};

const focusTargetRow = async (targetPath: string) => {
  if (!targetPath) {
    return;
  }

  focusedTarget.value = targetPath;
  await nextTick();
  browserRef.value?.scrollToTarget(targetPath);
};

const handleDrop = (target: string) => {
  const sourcePath = currentSourcePath();
  if (!sourcePath) {
    return;
  }
  upsertMapping(
    model.value,
    sourcePath,
    target,
    sourceFields.value.find((field) => field.path === sourcePath),
  );
  draggedSource.value = null;
  selectedSource.value = null;
  void focusDetailCard(target);
};

const applyAISuggestions = () => {
  applyHighConfidenceSuggestedMappings(
    model.value,
    sourceFields.value,
    targetFieldOptions.value,
  );
};

const applySuggestedResolution = (targetPath: string) => {
  const resolution = resolutionLookup.value[targetPath];
  if (!resolution) {
    return;
  }
  applyResolutionMapping(model.value, resolution);
  selectedSource.value = null;
  void focusDetailCard(targetPath);
};

const handleBrowserSourceDragStart = (sourcePath: string) => {
  selectedSource.value = sourcePath;
  draggedSource.value = sourcePath;
};

const handleBrowserSourceDragEnd = () => {
  draggedSource.value = null;
};

const handleBrowserTargetFocus = (targetPath: string) => {
  ensureMappingRow(targetPath);
  void focusDetailCard(targetPath);
};

const toggleRowDriver = (row: FieldMapping) => {
  const repeatBranchPath = repeatBranchForRow(row);
  if (!repeatBranchPath) {
    return;
  }

  rowDriverPath.value =
    rowDriverPath.value === repeatBranchPath ? undefined : repeatBranchPath;
  focusedTarget.value = row.to || null;
};

const deleteRow = (index: number) => {
  const [removed] = model.value.splice(index, 1);
  if (!removed) {
    return;
  }

  const removedBranch = repeatBranchForRow(removed);
  if (
    removedBranch &&
    rowDriverPath.value === removedBranch &&
    !model.value.some((row) => repeatBranchForRow(row) === removedBranch)
  ) {
    rowDriverPath.value = undefined;
  }

  if (focusedTarget.value === removed.to) {
    focusedTarget.value = null;
  }
};

watch(
  () => model.value.map((row) => row.from ?? ""),
  () => {
    if (
      rowDriverPath.value &&
      !model.value.some((row) => repeatBranchForRow(row) === rowDriverPath.value)
    ) {
      rowDriverPath.value = undefined;
    }
  },
  { deep: true },
);
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
          drag-and-drop suggestions to pre-wire the obvious matches.
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="sourceFields.length && targetPaths.length"
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

    <FieldMappingBrowser
      v-if="sourceFields.length && targetPaths.length"
      ref="browserRef"
      class="mb-6"
      :source-fields="sourceFields"
      :target-rows="targetRows"
      :selected-source="selectedSource"
      :dragging-source="Boolean(draggedSource)"
      :focused-target="focusedTarget"
      @update:selected-source="selectedSource = $event"
      @map-target="handleDrop"
      @focus-target="handleBrowserTargetFocus"
      @apply-suggestion="applySuggestedResolution"
      @drag-source-start="handleBrowserSourceDragStart"
      @drag-source-end="handleBrowserSourceDragEnd"
    />

    <div
      v-if="rowDriverPath"
      class="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
    >
      Rows are currently driven by <span class="font-semibold">{{ rowDriverPath }}</span>.
      Fields under this repeated XML branch stay aligned within the same emitted row.
    </div>

    <div class="space-y-4">
      <div
        v-for="(row, index) in model"
        :key="index"
        :ref="(element) => setDetailCardRef(row.to, element as Element | null)"
        data-testid="mapping-detail-card"
        :data-target-path="row.to"
        class="rounded-3xl border bg-slate-50/80 p-4"
        :class="
          focusedTarget === row.to
            ? 'border-sky-400 shadow-sm shadow-sky-100'
            : 'border-slate-200'
        "
      >
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Mapping detail
            </p>
            <p class="mt-1 break-all text-sm font-semibold text-slate-900">
              {{ row.to || "Unassigned target" }}
            </p>
          </div>
          <button
            v-if="row.to"
            class="button-secondary"
            type="button"
            @click="focusTargetRow(row.to)"
          >
            Back to target
          </button>
        </div>
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
              class="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-200"
            />
            Required
          </label>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-[1fr,1fr]">
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Repeat mode</span>
            <AppSelect v-model="row.repeatMode" :options="repeatModeOptions" />
          </label>
          <label class="space-y-2 text-sm font-medium text-slate-700">
            <span>Join delimiter</span>
            <input
              v-model="row.joinDelimiter"
              class="input"
              placeholder=", "
              :disabled="row.repeatMode === 'explode'"
            />
          </label>
        </div>
        <p
          v-if="lookupSourceField(row.from)?.type === 'array'"
          class="mt-3 text-xs font-medium text-sky-700"
        >
          {{
            props.sourceFormat === 'xml'
              ? 'Repeated XML source field detected. Use `preserve` to keep the array, or choose its repeated branch below to drive one row per item.'
              : 'Repeated source field detected. Use `preserve` to keep the array or `explode` to emit one row per item.'
          }}
        </p>
        <div
          v-if="repeatBranchForRow(row)"
          class="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
        >
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
            Repeated XML branch
          </p>
          <p class="mt-1 break-all font-medium">
            {{ repeatBranchForRow(row) }}
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button
              class="button-secondary"
              type="button"
              data-testid="mapping-row-driver-button"
              @click="toggleRowDriver(row)"
            >
              {{
                rowDriverPath === repeatBranchForRow(row)
                  ? "Clear row explosion"
                  : "Use this branch for row explosion"
              }}
            </button>
            <span
              v-if="rowDriverPath === repeatBranchForRow(row)"
              class="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700"
            >
              Active row driver
            </span>
          </div>
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
            @click="deleteRow(index)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
