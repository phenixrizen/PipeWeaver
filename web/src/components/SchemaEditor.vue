<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppSelect from "./AppSelect.vue";
import FieldMappingBrowser from "./FieldMappingBrowser.vue";
import SchemaTreeNode from "./SchemaTreeNode.vue";
import {
  applyResolutionMapping,
  createEmptySchema,
  createFieldFromSource,
  flattenSchemaLeafOptions,
  inferSourceFields,
  isTabularFormat,
  rankTargetMatches,
  removeMappingsForTargetPath,
  renameMappingTargets,
  type SourceFieldOption,
  upsertMapping,
} from "../lib/schema";
import type { FieldBrowserTargetRow } from "../lib/field-browser";
import type {
  FieldMapping,
  SchemaDefinition,
  SchemaField,
} from "../types/pipeline";

const schemaModel = defineModel<SchemaDefinition | undefined>({ required: true });
const mappings = defineModel<FieldMapping[]>("mappings", { required: true });

const props = defineProps<{
  sourceFormat: string;
  targetFormat: string;
  samplePayload: string;
}>();

const draggedSource = ref<string | null>(null);
const draggedNodePath = ref<number[] | null>(null);
const selectedSource = ref<string | null>(null);

const cloneFields = (fields: SchemaField[] | undefined): SchemaField[] =>
  (fields ?? []).map((field) => ({
    ...field,
    fields: cloneFields(field.fields),
  }));

const flattenToTabularFields = (
  fields: SchemaField[] | undefined,
  prefix = "",
): SchemaField[] => {
  if (!fields?.length) {
    return [];
  }

  return fields.flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if ((field.type === "object" || field.type === "array") && field.fields?.length) {
      return flattenToTabularFields(field.fields, path);
    }
    return [
      {
        name: path,
        type: field.type === "object" || field.type === "array" ? "string" : field.type,
        required: field.required,
        column: path,
      },
    ];
  });
};

const normalizeSchema = (
  targetFormat: string,
  schema: SchemaDefinition | undefined,
): SchemaDefinition => {
  const nextSchema: SchemaDefinition = schema
    ? {
        ...schema,
        fields: cloneFields(schema.fields),
      }
    : createEmptySchema(targetFormat);

  nextSchema.type = "object";
  nextSchema.fields ??= [];

  if (isTabularFormat(targetFormat)) {
    nextSchema.name = undefined;
    nextSchema.fields = flattenToTabularFields(nextSchema.fields).map(
      (field, index) => ({
        ...field,
        index,
        column: field.column || field.name,
      }),
    );
    return nextSchema;
  }

  if (targetFormat === "xml" && !nextSchema.name) {
    nextSchema.name = "record";
  }

  return nextSchema;
};

watch(
  () => [props.targetFormat, JSON.stringify(schemaModel.value ?? null)],
  () => {
    const normalized = normalizeSchema(props.targetFormat, schemaModel.value);
    const current = JSON.stringify(schemaModel.value ?? null);
    const next = JSON.stringify(normalized);
    if (current !== next) {
      schemaModel.value = normalized;
    }
  },
  { immediate: true },
);

const sourceFields = computed(() =>
  inferSourceFields(props.sourceFormat, props.samplePayload),
);

const sourceDragActive = computed(() => Boolean(draggedSource.value));
const nodeDragActive = computed(() => Boolean(draggedNodePath.value));

const sourceFieldLookup = computed<Record<string, SourceFieldOption>>(
  () =>
    Object.fromEntries(
      sourceFields.value.map((field) => [field.path, field]),
    ) as Record<string, SourceFieldOption>,
);

const mappedSources = computed<Record<string, string | undefined>>(() =>
  Object.fromEntries(
    mappings.value.map((mapping) => [
      mapping.to,
      mapping.from || (mapping.expression ? "CEL expression" : undefined),
    ]),
  ),
);

const tabularMode = computed(() => isTabularFormat(props.targetFormat));

const schemaFields = computed(() => schemaModel.value?.fields ?? []);
const targetFieldOptions = computed(() =>
  flattenSchemaLeafOptions(schemaModel.value?.fields),
);
const targetResolutions = computed(() =>
  rankTargetMatches(sourceFields.value, targetFieldOptions.value),
);
const resolutionLookup = computed<
  Record<string, (typeof targetResolutions.value)[number]>
>(
  () =>
    Object.fromEntries(
      targetResolutions.value.map((resolution) => [resolution.target, resolution]),
    ) as Record<string, (typeof targetResolutions.value)[number]>,
);
const targetRows = computed<FieldBrowserTargetRow[]>(() =>
  targetFieldOptions.value.map((target) => {
    const resolution = resolutionLookup.value[target.path];
    const mappedSource = mappedSources.value[target.path];

    return {
      path: target.path,
      type: target.type,
      mappedSource,
      suggestedSource: mappedSource ? undefined : resolution?.suggestedSource,
      status: mappedSource
        ? "mapped"
        : resolution?.suggestedSource
          ? "suggested"
          : "unmatched",
    };
  }),
);

const reindexTabularFields = () => {
  if (!tabularMode.value) {
    return;
  }

  schemaFields.value.forEach((field, index) => {
    field.index = index;
    field.column = field.name;
  });
};

const sanitizeFieldName = (value: string) => {
  const normalized = value
    .trim()
    .replace(
      tabularMode.value ? /[^a-zA-Z0-9_.]+/g : /[^a-zA-Z0-9_]+/g,
      "_",
    )
    .replace(/^_+|_+$/g, "");
  return normalized || "field";
};

const uniqueFieldName = (base: string, fields: SchemaField[], skipIndex?: number) => {
  let candidate = base;
  let suffix = 2;
  while (
    fields.some(
      (field, index) => field.name === candidate && index !== skipIndex,
    )
  ) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const pathsEqual = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const pathStartsWith = (path: number[], prefix: number[]) =>
  prefix.length <= path.length &&
  prefix.every((value, index) => path[index] === value);

const adjustPathAfterRemoval = (path: number[], removedPath: number[]) => {
  if (!path.length || !removedPath.length) {
    return [...path];
  }

  const adjusted = [...path];
  const parentPath = removedPath.slice(0, -1);
  const removedIndex = removedPath[removedPath.length - 1];

  if (adjusted.length < parentPath.length + 1) {
    return adjusted;
  }

  for (let index = 0; index < parentPath.length; index += 1) {
    if (adjusted[index] !== parentPath[index]) {
      return adjusted;
    }
  }

  if (adjusted[parentPath.length] > removedIndex) {
    adjusted[parentPath.length] -= 1;
  }

  return adjusted;
};

const getFieldCollection = (nodePath: number[] = []) => {
  if (!schemaModel.value) {
    schemaModel.value = createEmptySchema(props.targetFormat);
  }

  let fields = schemaModel.value.fields;
  if (nodePath.length === 0) {
    return fields;
  }

  let current: SchemaField | undefined;
  nodePath.forEach((index, depth) => {
    if (depth === 0) {
      current = fields[index];
    } else {
      current = current?.fields?.[index];
    }
  });

  current!.fields ??= [];
  return current!.fields!;
};

const getField = (nodePath: number[]) => {
  if (!nodePath.length) {
    return undefined;
  }

  let field: SchemaField | undefined = schemaFields.value[nodePath[0]];
  for (let index = 1; index < nodePath.length; index += 1) {
    field = field?.fields?.[nodePath[index]];
  }
  return field;
};

const getTargetPath = (nodePath: number[]) => {
  const names: string[] = [];
  let fields = schemaFields.value;

  nodePath.forEach((index) => {
    const field = fields[index];
    if (!field) {
      return;
    }
    names.push(field.name);
    fields = field.fields ?? [];
  });

  return names.join(".");
};

const createManualField = (
  fields: SchemaField[],
  kind: "leaf" | "object" | "array",
): SchemaField => {
  const name = uniqueFieldName(
    kind === "object" ? "group" : kind === "array" ? "items" : "field",
    fields,
  );
  return {
    name,
    type:
      kind === "object" && !tabularMode.value
        ? "object"
        : kind === "array" && !tabularMode.value
          ? "array"
          : "string",
    required: false,
    column: tabularMode.value ? name : undefined,
    index: tabularMode.value ? fields.length : undefined,
    fields:
      (kind === "object" || kind === "array") && !tabularMode.value ? [] : undefined,
  };
};

const addRootField = (kind: "leaf" | "object" | "array") => {
  const nextField = createManualField(schemaFields.value, kind);
  schemaFields.value.push(nextField);
  reindexTabularFields();
};

const addChildField = (
  nodePath: number[],
  kind: "leaf" | "object" | "array",
) => {
  const parent = getField(nodePath);
  if (!parent) {
    return;
  }
  if (parent.type !== "object" && parent.type !== "array") {
    const targetPath = getTargetPath(nodePath);
    if (targetPath) {
      removeMappingsForTargetPath(mappings.value, targetPath);
    }
  }
  if (parent.type !== "array") {
    parent.type = "object";
  }
  parent.fields ??= [];
  parent.fields.push(createManualField(parent.fields, kind));
};

const moveField = (nodePath: number[], direction: -1 | 1) => {
  const collection = getFieldCollection(nodePath.slice(0, -1));
  const index = nodePath[nodePath.length - 1];
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= collection.length) {
    return;
  }
  const current = collection[index];
  collection[index] = collection[nextIndex];
  collection[nextIndex] = current;
  reindexTabularFields();
};

const removeField = (nodePath: number[]) => {
  const collection = getFieldCollection(nodePath.slice(0, -1));
  const targetPath = getTargetPath(nodePath);
  collection.splice(nodePath[nodePath.length - 1], 1);
  if (targetPath) {
    removeMappingsForTargetPath(mappings.value, targetPath);
  }
  reindexTabularFields();
};

const startNodeDrag = (nodePath: number[]) => {
  draggedSource.value = null;
  selectedSource.value = null;
  draggedNodePath.value = [...nodePath];
};

const endNodeDrag = () => {
  draggedNodePath.value = null;
};

const relocateNode = (
  sourcePath: number[],
  destinationParentPath: number[],
  destinationIndex: number,
) => {
  const sourceParentPath = sourcePath.slice(0, -1);
  const sourceCollection = getFieldCollection(sourceParentPath);
  const sourceIndex = sourcePath[sourcePath.length - 1];
  const oldPath = getTargetPath(sourcePath);
  const [node] = sourceCollection.splice(sourceIndex, 1);

  if (!node) {
    return;
  }

  const destinationCollection = getFieldCollection(destinationParentPath);
  const boundedIndex = Math.max(
    0,
    Math.min(destinationIndex, destinationCollection.length),
  );

  node.name = uniqueFieldName(node.name, destinationCollection);
  destinationCollection.splice(boundedIndex, 0, node);

  const parentTargetPath = destinationParentPath.length
    ? getTargetPath(destinationParentPath)
    : "";
  const newPath = parentTargetPath ? `${parentTargetPath}.${node.name}` : node.name;

  if (oldPath && oldPath !== newPath) {
    renameMappingTargets(mappings.value, oldPath, newPath);
  }

  reindexTabularFields();
};

const moveDraggedNode = (
  targetNodePath: number[],
  position: "before" | "after" | "inside",
) => {
  const sourcePath = draggedNodePath.value;
  if (!sourcePath) {
    return;
  }

  if (pathsEqual(sourcePath, targetNodePath)) {
    draggedNodePath.value = null;
    return;
  }

  if (pathStartsWith(targetNodePath, sourcePath)) {
    draggedNodePath.value = null;
    return;
  }

  if (position === "inside") {
    const adjustedParentPath = adjustPathAfterRemoval(targetNodePath, sourcePath);
    const targetField = getField(adjustedParentPath);
    if (
      !targetField ||
      (targetField.type !== "object" && targetField.type !== "array")
    ) {
      draggedNodePath.value = null;
      return;
    }
    relocateNode(
      sourcePath,
      adjustedParentPath,
      targetField.fields?.length ?? 0,
    );
    draggedNodePath.value = null;
    return;
  }

  const adjustedTargetPath = adjustPathAfterRemoval(targetNodePath, sourcePath);
  const destinationParentPath = adjustedTargetPath.slice(0, -1);
  const targetIndex = adjustedTargetPath[adjustedTargetPath.length - 1] ?? 0;

  relocateNode(
    sourcePath,
    destinationParentPath,
    position === "before" ? targetIndex : targetIndex + 1,
  );
  draggedNodePath.value = null;
};

const moveDraggedNodeToRoot = () => {
  const sourcePath = draggedNodePath.value;
  if (!sourcePath) {
    return;
  }

  relocateNode(sourcePath, [], schemaFields.value.length);
  draggedNodePath.value = null;
};

const renameField = (nodePath: number[], value: string) => {
  const field = getField(nodePath);
  if (!field) {
    return;
  }

  const siblings = getFieldCollection(nodePath.slice(0, -1));
  const index = nodePath[nodePath.length - 1];
  const oldPath = getTargetPath(nodePath);
  const oldName = field.name;
  const nextName = uniqueFieldName(
    sanitizeFieldName(value),
    siblings,
    index,
  );

  field.name = nextName;
  if (tabularMode.value && (!field.column || field.column === oldName)) {
    field.column = nextName;
  }

  const nextPath = getTargetPath(nodePath);
  if (oldPath && nextPath && oldPath !== nextPath) {
    renameMappingTargets(mappings.value, oldPath, nextPath);
  }
  reindexTabularFields();
};

const updateFieldType = (nodePath: number[], value: string) => {
  const field = getField(nodePath);
  if (!field) {
    return;
  }

  const oldType = field.type;
  const targetPath = getTargetPath(nodePath);
  field.type = value;

  if ((value === "object" || value === "array") && !tabularMode.value) {
    field.fields ??= [];
  } else {
    field.fields = undefined;
  }

  if (
    targetPath &&
    oldType !== value &&
    (oldType === "object" ||
      oldType === "array" ||
      value === "object" ||
      value === "array")
  ) {
    removeMappingsForTargetPath(mappings.value, targetPath);
  }
};

const toggleRequired = (nodePath: number[], value: boolean) => {
  const field = getField(nodePath);
  if (field) {
    field.required = value;
  }
};

const currentSourcePath = () => draggedSource.value ?? selectedSource.value;

const clearSourceSelection = () => {
  draggedSource.value = null;
  selectedSource.value = null;
};

const startSourceDrag = (sourcePath: string) => {
  draggedNodePath.value = null;
  selectedSource.value = sourcePath;
  draggedSource.value = sourcePath;
};

const endSourceDrag = () => {
  draggedSource.value = null;
};

const mapSourcePathToTarget = (sourcePath: string, targetPath: string) => {
  upsertMapping(
    mappings.value,
    sourcePath,
    targetPath,
    sourceFieldLookup.value[sourcePath],
  );
  clearSourceSelection();
};

const mapDraggedSource = (nodePath: number[]) => {
  const sourcePath = currentSourcePath();
  if (!sourcePath) {
    return;
  }
  const targetPath = getTargetPath(nodePath);
  if (!targetPath) {
    return;
  }
  mapSourcePathToTarget(sourcePath, targetPath);
};

const appendSelectedSource = (parentPath: number[] = []) => {
  const sourcePath = currentSourcePath();
  if (!sourcePath) {
    return;
  }

  const source = sourceFieldLookup.value[sourcePath];
  if (!source) {
    return;
  }

  const collection = getFieldCollection(parentPath);
  const nextField = createFieldFromSource(source, collection, props.targetFormat);
  collection.push(nextField);
  reindexTabularFields();

  const targetPath = parentPath.length
    ? `${getTargetPath(parentPath)}.${nextField.name}`
    : nextField.name;

  upsertMapping(mappings.value, source.path, targetPath, source);
  clearSourceSelection();
};

const handleRootDrop = () => {
  if (draggedNodePath.value) {
    moveDraggedNodeToRoot();
    return;
  }
  appendSelectedSource();
};

const handleObjectDrop = (nodePath: number[]) => {
  if (draggedNodePath.value) {
    moveDraggedNode(nodePath, "inside");
    return;
  }
  appendSelectedSource(nodePath);
};

const handleBrowserTargetMap = (targetPath: string) => {
  const sourcePath = currentSourcePath();
  if (!sourcePath) {
    return;
  }
  mapSourcePathToTarget(sourcePath, targetPath);
};

const applySuggestedResolution = (targetPath: string) => {
  const resolution = resolutionLookup.value[targetPath];
  if (!resolution) {
    return;
  }
  applyResolutionMapping(mappings.value, resolution);
  clearSourceSelection();
};

const onTabularNameChange = (index: number, event: Event) => {
  renameField([index], (event.target as HTMLInputElement).value);
};

const onTabularTypeChange = (index: number, value: string) => {
  updateFieldType([index], value);
};

const onTabularRequiredChange = (index: number, event: Event) => {
  toggleRequired([index], (event.target as HTMLInputElement).checked);
};

const tabularTypeOptions = ["string", "integer", "number", "boolean"];

const xmlItemName = computed({
  get: () => schemaModel.value?.name ?? "record",
  set: (value: string) => {
    if (!schemaModel.value) {
      schemaModel.value = createEmptySchema(props.targetFormat);
    }
    schemaModel.value.name = sanitizeFieldName(value) || "record";
  },
});
</script>

<template>
  <section class="panel p-5">
    <div
      class="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-start xl:justify-between"
    >
      <div>
        <p class="panel-title">Target schema</p>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Define the output contract visually. Drag source fields onto targets
          to create mappings, or drop onto the add zone to create new output
          fields and wire them in one step.
        </p>
      </div>
      <div
        class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
      >
        {{
          tabularMode
            ? "Tabular outputs use a flat ordered column list."
            : "JSON and XML outputs use a nested target tree."
        }}
      </div>
    </div>

    <FieldMappingBrowser
      :source-fields="sourceFields"
      :target-rows="targetRows"
      :selected-source="selectedSource"
      :dragging-source="Boolean(draggedSource)"
      @update:selected-source="selectedSource = $event"
      @map-target="handleBrowserTargetMap"
      @apply-suggestion="applySuggestedResolution"
      @drag-source-start="startSourceDrag"
      @drag-source-end="endSourceDrag"
    />

    <div class="mt-4 space-y-4">
        <label
          v-if="props.targetFormat === 'xml'"
          class="space-y-2 text-sm font-medium text-slate-700"
        >
          <span>XML record element</span>
          <input v-model="xmlItemName" class="input" />
        </label>

        <div v-if="tabularMode" class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <button class="button-secondary" type="button" @click="addRootField('leaf')">
              Add column
            </button>
            <button
              v-if="selectedSource"
              class="button-secondary"
              type="button"
              @click="appendSelectedSource()"
            >
              Create target from selected source
            </button>
          </div>

          <div
            data-testid="schema-root-drop-zone"
            class="rounded-2xl border border-dashed bg-[linear-gradient(135deg,_rgba(14,165,233,0.06),_rgba(255,255,255,1))] px-4 py-4 transition"
            :class="
              sourceDragActive || nodeDragActive
                ? 'border-sky-300 shadow-sm'
                : 'border-slate-300'
            "
            @dragover.prevent
            @drop.prevent="handleRootDrop"
          >
            <p class="text-sm font-semibold text-slate-900">
              {{
                nodeDragActive
                  ? "Drop a target node here to move it to the root column list."
                  : "Drop a source field here to create a new output column and mapping."
              }}
            </p>
          </div>

          <div v-if="schemaFields.length" class="space-y-3">
            <div
              v-for="(field, index) in schemaFields"
              :key="`${field.name}.${index}`"
              class="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm"
            >
              <div class="grid gap-3 lg:grid-cols-[1.1fr,0.8fr,auto,auto]">
                <label class="space-y-2 text-sm font-medium text-slate-700">
                  <span>Column name</span>
                  <input
                    :value="field.name"
                    class="input"
                    placeholder="column_name"
                    @change="onTabularNameChange(index, $event)"
                  />
                </label>
                <label class="space-y-2 text-sm font-medium text-slate-700">
                  <span>Type</span>
                  <AppSelect
                    :model-value="field.type"
                    :options="tabularTypeOptions"
                    @update:modelValue="onTabularTypeChange(index, String($event))"
                  />
                </label>
                <label
                  class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                >
                  <input
                    :checked="field.required"
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-200"
                    @change="onTabularRequiredChange(index, $event)"
                  />
                  Required
                </label>
                <div class="flex flex-wrap items-end justify-end gap-2">
                  <button
                    class="button-secondary"
                    type="button"
                    @click="moveField([index], -1)"
                  >
                    Up
                  </button>
                  <button
                    class="button-secondary"
                    type="button"
                    @click="moveField([index], 1)"
                  >
                    Down
                  </button>
                  <button
                    class="button-secondary"
                    type="button"
                    @click="removeField([index])"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div class="mt-3 grid gap-3 xl:grid-cols-[1fr,1fr]">
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p
                    class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Output column
                  </p>
                  <p class="mt-2 text-sm font-semibold text-slate-900">
                    {{ field.name }}
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-dashed bg-[linear-gradient(135deg,_rgba(14,165,233,0.08),_rgba(255,255,255,1))] px-4 py-3 transition"
                  :class="
                    sourceDragActive
                      ? 'border-sky-300 shadow-sm'
                      : 'border-slate-300'
                  "
                  @dragover.prevent
                  @drop.prevent="mapDraggedSource([index])"
                >
                  <p
                    class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Mapped source
                  </p>
                  <p class="mt-2 text-sm font-medium text-slate-900">
                    {{
                      mappedSources[field.name] ||
                      "Drop a source field here to map it."
                    }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-slate-500">
            No output columns yet.
          </p>
        </div>

        <div v-else class="space-y-4">
          <div class="flex flex-wrap gap-2">
            <button class="button-secondary" type="button" @click="addRootField('leaf')">
              Add field
            </button>
            <button class="button-secondary" type="button" @click="addRootField('object')">
              Add object
            </button>
            <button class="button-secondary" type="button" @click="addRootField('array')">
              Add array
            </button>
            <button
              v-if="selectedSource"
              class="button-secondary"
              type="button"
              @click="appendSelectedSource()"
            >
              Create target from selected source
            </button>
          </div>

          <div
            data-testid="schema-root-drop-zone"
            class="rounded-2xl border border-dashed bg-[linear-gradient(135deg,_rgba(14,165,233,0.06),_rgba(255,255,255,1))] px-4 py-4 transition"
            :class="
              sourceDragActive || nodeDragActive
                ? 'border-sky-300 shadow-sm'
                : 'border-slate-300'
            "
            @dragover.prevent
            @drop.prevent="handleRootDrop"
          >
            <p class="text-sm font-semibold text-slate-900">
              {{
                nodeDragActive
                  ? "Drop a target node here to move it to the root."
                  : "Drop a source field here to create a new target at the root."
              }}
            </p>
          </div>

          <div v-if="schemaFields.length" class="space-y-3">
            <SchemaTreeNode
              v-for="(field, index) in schemaFields"
              :key="`${field.name}.${index}`"
              :field="field"
              :node-path="[index]"
              :target-path="field.name"
              :mapped-sources="mappedSources"
              :source-drag-active="sourceDragActive"
              :node-drag-active="nodeDragActive"
              :level="0"
              @rename-field="renameField"
              @update-field-type="updateFieldType"
              @toggle-required="toggleRequired"
              @map-drop="mapDraggedSource"
              @append-source="handleObjectDrop"
              @add-child="addChildField"
              @move-field="moveField"
              @remove-field="removeField"
              @node-drag-start="startNodeDrag"
              @node-drag-end="endNodeDrag"
              @move-drop="moveDraggedNode"
            />
          </div>
          <p v-else class="text-sm text-slate-500">
            No target fields yet.
          </p>
        </div>
    </div>
  </section>
</template>
