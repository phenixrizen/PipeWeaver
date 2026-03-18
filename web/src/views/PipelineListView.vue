<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import EmptyState from "../components/EmptyState.vue";
import LoadingState from "../components/LoadingState.vue";
import PageHeader from "../components/PageHeader.vue";
import PipelineList from "../components/PipelineList.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();
const pipelineCount = computed(() => store.pipelines.length);

onMounted(() => {
  void store.loadPipelines();
});
</script>

<template>
  <div>
    <PageHeader
      title="Pipeline catalog"
      description="Browse saved flows, inspect live HTTP-ready configurations, and jump into the visual studio to refine mappings and response behavior."
    >
      <RouterLink class="button-primary" to="/pipelines/new">
        New pipeline
      </RouterLink>
    </PageHeader>

    <div class="mb-8 grid gap-4 xl:grid-cols-3">
      <section class="subtle-card p-5">
        <p class="panel-title">Stored pipelines</p>
        <p class="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          {{ pipelineCount }}
        </p>
        <p class="mt-2 text-sm text-slate-600">
          Definitions currently available in the active API store.
        </p>
      </section>
      <section class="subtle-card p-5">
        <p class="panel-title">Response-ready flows</p>
        <p class="mt-3 text-lg font-semibold text-slate-900">
          HTTP in, transformed payload out
        </p>
        <p class="mt-2 text-sm text-slate-600">
          Enable reply mode on a target connector to return transformed output
          on the same request connection.
        </p>
      </section>
      <section class="subtle-card p-5">
        <p class="panel-title">Visual mapping</p>
        <p class="mt-3 text-lg font-semibold text-slate-900">
          Drag CSV columns into schema targets
        </p>
        <p class="mt-2 text-sm text-slate-600">
          Use AI-assisted suggestions to pre-wire likely matches before fine
          tuning field transforms.
        </p>
      </section>
    </div>

    <LoadingState v-if="store.loading && !store.pipelines.length" />
    <EmptyState
      v-else-if="!store.pipelines.length"
      title="No pipelines yet"
      message="Create a flow to unlock the visual editor, generated endpoint curl commands, and request-to-response previews."
    >
      <RouterLink class="button-primary" to="/pipelines/new">
        Create your first pipeline
      </RouterLink>
    </EmptyState>
    <PipelineList v-else :pipelines="store.pipelines" />
  </div>
</template>
