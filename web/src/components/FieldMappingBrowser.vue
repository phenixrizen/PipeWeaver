<script setup lang="ts">
import { computed, ref } from "vue";
import type { SourceFieldOption } from "../lib/schema";
import type {
  FieldBrowserTargetRow,
  FieldBrowserTargetStatus,
} from "../lib/field-browser";

const props = withDefaults(
  defineProps<{
    sourceFields: SourceFieldOption[];
    targetRows: FieldBrowserTargetRow[];
    selectedSource?: string | null;
    draggingSource?: boolean;
    focusedTarget?: string | null;
  }>(),
  {
    selectedSource: null,
    draggingSource: false,
    focusedTarget: null,
  },
);

const emit = defineEmits<{
  "update:selectedSource": [value: string | null];
  "map-target": [targetPath: string];
  "focus-target": [targetPath: string];
  "apply-suggestion": [targetPath: string];
  "drag-source-start": [sourcePath: string];
  "drag-source-end": [];
}>();

const sourceSearch = ref("");
const targetSearch = ref("");
const targetFilter = ref<"unmatched" | "all" | "mapped">("unmatched");

const activeMappingSource = computed(
  () => props.draggingSource || Boolean(props.selectedSource),
);

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const filteredSourceFields = computed(() => {
  const query = normalizeSearch(sourceSearch.value);
  if (!query) {
    return props.sourceFields;
  }

  return props.sourceFields.filter((field) =>
    [field.path, field.label, field.type]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
});

const filteredTargetRows = computed(() => {
  const query = normalizeSearch(targetSearch.value);

  return props.targetRows.filter((row) => {
    if (targetFilter.value === "mapped" && !row.mappedSource) {
      return false;
    }
    if (targetFilter.value === "unmatched" && row.mappedSource) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [row.path, row.mappedSource, row.suggestedSource, row.type]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
});

const targetCounts = computed(() => ({
  all: props.targetRows.length,
  mapped: props.targetRows.filter((row) => Boolean(row.mappedSource)).length,
  unmatched: props.targetRows.filter((row) => !row.mappedSource).length,
}));

const targetRowRefs = new Map<string, HTMLElement>();

const setTargetRowRef = (path: string, element: Element | null) => {
  if (!(element instanceof HTMLElement)) {
    targetRowRefs.delete(path);
    return;
  }
  targetRowRefs.set(path, element);
};

const selectSource = (path: string) => {
  emit(
    "update:selectedSource",
    props.selectedSource === path ? null : path,
  );
};

const onTargetClick = (targetPath: string) => {
  if (!activeMappingSource.value) {
    emit("focus-target", targetPath);
    return;
  }
  emit("map-target", targetPath);
};

const scrollToTarget = (targetPath: string) => {
  const targetRow = props.targetRows.find((row) => row.path === targetPath);
  if (!targetRow) {
    return;
  }

  targetSearch.value = "";
  targetFilter.value = targetRow.mappedSource ? "mapped" : "unmatched";

  const scroll = () => {
    targetRowRefs.get(targetPath)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(scroll);
    return;
  }

  scroll();
};

const sourceMeta = (field: SourceFieldOption) => {
  const parts = [field.type];
  if (field.repeatable) {
    parts.push(
      field.observedIndexCount && field.observedIndexCount > 1
        ? `repeats ${field.observedIndexCount}x`
        : "repeatable",
    );
  }
  return parts.join(" · ");
};

const statusLabel = (status: FieldBrowserTargetStatus) => {
  if (status === "mapped") {
    return "Mapped";
  }
  if (status === "suggested") {
    return "Suggested";
  }
  return "Unmatched";
};

const statusClasses = (status: FieldBrowserTargetStatus) => {
  if (status === "mapped") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "suggested") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
};

defineExpose({
  scrollToTarget,
});
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
    <div class="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-900">Source fields</p>
          <p class="mt-1 text-xs text-slate-500">
            Select or drag a source field.
          </p>
        </div>
        <span
          class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500"
        >
          {{ sourceFields.length }} total
        </span>
      </div>

      <label class="mt-4 block space-y-2 text-sm font-medium text-slate-700">
        <span>Search source fields</span>
        <input
          v-model="sourceSearch"
          data-testid="field-browser-source-search"
          class="input"
          placeholder="Search source paths"
        />
      </label>

      <div
        class="mt-4 max-h-[30rem] space-y-2 overflow-auto pr-1"
        data-testid="field-browser-source-list"
      >
        <button
          v-for="source in filteredSourceFields"
          :key="source.path"
          data-testid="source-field-chip"
          :data-source-path="source.path"
          class="w-full rounded-2xl border px-4 py-3 text-left transition"
          :class="
            selectedSource === source.path
              ? 'border-sky-500 bg-sky-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/60'
          "
          type="button"
          draggable="true"
          @click="selectSource(source.path)"
          @dragstart="emit('drag-source-start', source.path)"
          @dragend="emit('drag-source-end')"
        >
          <p class="break-all text-sm font-semibold text-slate-900">
            {{ source.label }}
          </p>
          <p
            class="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
          >
            {{ sourceMeta(source) }}
          </p>
        </button>

        <p
          v-if="!filteredSourceFields.length"
          class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
        >
          No source fields match the current search.
        </p>
      </div>
    </div>

    <div
      class="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.08),_rgba(255,255,255,1))] p-4"
    >
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-900">Output targets</p>
          <p class="mt-1 text-xs text-slate-500">
            Search targets, review local suggestions, and map the selected source.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            data-testid="field-browser-filter-unmatched"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
            :class="
              targetFilter === 'unmatched'
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            "
            type="button"
            @click="targetFilter = 'unmatched'"
          >
            Unmatched {{ targetCounts.unmatched }}
          </button>
          <button
            data-testid="field-browser-filter-all"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
            :class="
              targetFilter === 'all'
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            "
            type="button"
            @click="targetFilter = 'all'"
          >
            All {{ targetCounts.all }}
          </button>
          <button
            data-testid="field-browser-filter-mapped"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
            :class="
              targetFilter === 'mapped'
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            "
            type="button"
            @click="targetFilter = 'mapped'"
          >
            Mapped {{ targetCounts.mapped }}
          </button>
        </div>
      </div>

      <label class="mt-4 block space-y-2 text-sm font-medium text-slate-700">
        <span>Search output targets</span>
        <input
          v-model="targetSearch"
          data-testid="field-browser-target-search"
          class="input"
          placeholder="Search target paths"
        />
      </label>

      <div
        class="mt-4 max-h-[30rem] space-y-3 overflow-auto pr-1"
        data-testid="field-browser-target-list"
      >
        <div
          v-for="row in filteredTargetRows"
          :key="row.path"
          :ref="(element) => setTargetRowRef(row.path, element as Element | null)"
          data-testid="field-browser-target-row"
          :data-target-path="row.path"
          class="rounded-2xl border bg-white p-4 transition"
          :class="
            props.focusedTarget === row.path
              ? 'border-sky-500 bg-sky-50 shadow-sm'
              : activeMappingSource
                ? 'cursor-pointer border-sky-300 shadow-sm hover:border-sky-500'
                : 'cursor-pointer border-slate-200 hover:border-sky-300'
          "
          @click="onTargetClick(row.path)"
          @dragover.prevent
          @drop.prevent="emit('map-target', row.path)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="break-all text-sm font-semibold text-slate-900">
                  {{ row.path }}
                </p>
                <span
                  class="rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                  :class="statusClasses(row.status)"
                >
                  {{ statusLabel(row.status) }}
                </span>
                <span
                  class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                >
                  {{ row.type }}
                </span>
              </div>
              <p
                class="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
              >
                {{ row.mappedSource ? "Mapped source" : row.suggestedSource ? "Local suggestion" : "Status" }}
              </p>
              <p class="mt-1 break-all text-sm text-slate-700">
                {{
                  row.mappedSource ||
                  row.suggestedSource ||
                  (activeMappingSource
                    ? "Click this target to map the selected source."
                    : "No mapped source yet.")
                }}
              </p>
            </div>

            <button
              v-if="row.suggestedSource && !row.mappedSource"
              data-testid="field-browser-apply-suggestion"
              class="button-secondary whitespace-nowrap"
              type="button"
              @click.stop="emit('apply-suggestion', row.path)"
            >
              Apply suggestion
            </button>
          </div>
        </div>

        <p
          v-if="!filteredTargetRows.length"
          class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
        >
          No output targets match the current filter.
        </p>
      </div>
    </div>
  </div>
</template>
