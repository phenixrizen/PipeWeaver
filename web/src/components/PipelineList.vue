<script setup lang="ts">
import { computed, ref } from "vue";
import type { PipelineDefinition } from "../types/pipeline";

const props = withDefaults(
  defineProps<{
    pipelines: PipelineDefinition[];
    deletingId?: string | null;
  }>(),
  {
    deletingId: null,
  },
);

const emit = defineEmits<{
  delete: [id: string];
}>();

const pendingDeleteId = ref<string | null>(null);

const pendingDeletePipeline = computed(
  () =>
    props.pipelines.find(
      (pipeline) => pipeline.pipeline.id === pendingDeleteId.value,
    ) ?? null,
);

const openDeleteDialog = (id: string) => {
  pendingDeleteId.value = id;
};

const closeDeleteDialog = () => {
  pendingDeleteId.value = null;
};

const confirmDelete = () => {
  if (!pendingDeletePipeline.value) {
    return;
  }

  emit("delete", pendingDeletePipeline.value.pipeline.id);
  pendingDeleteId.value = null;
};
</script>

<template>
  <div>
    <div class="grid gap-4 xl:grid-cols-2">
      <article
        v-for="pipeline in pipelines"
        :key="pipeline.pipeline.id"
        class="panel p-5"
      >
        <div class="flex items-start justify-between gap-4">
          <RouterLink
            :to="`/pipelines/${pipeline.pipeline.id}`"
            class="group min-w-0 flex-1"
          >
            <p
              class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400"
            >
              {{ pipeline.pipeline.id }}
            </p>
            <h3
              class="mt-2 text-xl font-semibold text-gray-900 transition group-hover:text-sky-600"
            >
              {{ pipeline.pipeline.name }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-gray-600">
              {{ pipeline.pipeline.description || "No description yet." }}
            </p>

            <div class="mt-5 flex flex-wrap gap-2 text-xs font-medium">
              <span
                class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600"
              >
                {{ pipeline.source.type }} → {{ pipeline.target.type }}
              </span>
              <span
                class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600"
              >
                {{ pipeline.source.format }} → {{ pipeline.target.format }}
              </span>
            </div>
          </RouterLink>

          <div class="flex flex-col items-end gap-2">
            <RouterLink
              :to="`/pipelines/${pipeline.pipeline.id}`"
              class="button-secondary"
            >
              Open
            </RouterLink>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="pipeline-delete-button"
              :data-pipeline-id="pipeline.pipeline.id"
              :disabled="deletingId === pipeline.pipeline.id"
              @click="openDeleteDialog(pipeline.pipeline.id)"
            >
              {{ deletingId === pipeline.pipeline.id ? "Deleting..." : "Delete" }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="pendingDeletePipeline"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4"
    >
      <div class="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
        <p class="panel-title text-rose-500">Delete pipeline</p>
        <h3 class="mt-3 text-xl font-semibold text-slate-900">
          Delete {{ pendingDeletePipeline.pipeline.name }}?
        </h3>
        <p class="mt-3 text-sm leading-6 text-slate-600">
          This removes the saved pipeline definition for
          <span class="font-semibold text-slate-900">
            {{ pendingDeletePipeline.pipeline.id }}
          </span>
          from the catalog.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="button-secondary"
            data-testid="pipeline-delete-cancel"
            @click="closeDeleteDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700"
            data-testid="pipeline-delete-confirm"
            @click="confirmDelete"
          >
            Delete pipeline
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
