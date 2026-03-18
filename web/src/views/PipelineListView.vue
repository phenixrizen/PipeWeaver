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
      description="Browse saved flows, inspect connector combinations, and jump straight into editing from a dashboard-inspired control surface."
    >
      <RouterLink class="button-primary" to="/pipelines/new">
        New pipeline
      </RouterLink>
    </PageHeader>

    <div class="mb-8 grid gap-4 xl:grid-cols-3">
      <section class="subtle-card p-5">
        <p class="panel-title">Stored pipelines</p>
        <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">
          {{ pipelineCount }}
        </p>
        <p class="mt-2 text-sm text-gray-600">
          Definitions currently available in the active API store.
        </p>
      </section>
      <section class="subtle-card p-5">
        <p class="panel-title">Editor flow</p>
        <p class="mt-3 text-lg font-semibold text-gray-900">
          Create, preview, and save
        </p>
        <p class="mt-2 text-sm text-gray-600">
          Open a draft, test mappings against sample payloads, then persist the
          result for later reuse.
        </p>
      </section>
      <section class="subtle-card p-5">
        <p class="panel-title">Bundled examples</p>
        <p class="mt-3 text-lg font-semibold text-gray-900">
          Use
          <code class="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white"
            >-seed-examples</code
          >
        </p>
        <p class="mt-2 text-sm text-gray-600">
          Seed example definitions into the store at startup so they appear
          alongside user-created pipelines.
        </p>
      </section>
    </div>

    <LoadingState v-if="store.loading && !store.pipelines.length" />
    <EmptyState
      v-else-if="!store.pipelines.length"
      title="No pipelines yet"
      message="Seed the bundled examples or create a fresh definition to populate this dashboard."
    >
      <RouterLink class="button-primary" to="/pipelines/new">
        Create your first pipeline
      </RouterLink>
    </EmptyState>
    <PipelineList v-else :pipelines="store.pipelines" />
  </div>
</template>
