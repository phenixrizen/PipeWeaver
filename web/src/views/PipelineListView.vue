<script setup lang="ts">
import { onMounted } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import LoadingState from "@/components/LoadingState.vue";
import PageHeader from "@/components/PageHeader.vue";
import PipelineList from "@/components/PipelineList.vue";
import { usePipelineStore } from "@/stores/pipelines";

const store = usePipelineStore();

// onMounted loads saved pipelines when the dashboard is opened.
onMounted(() => {
  void store.loadAll();
});
</script>

<template>
  <PageHeader
    title="Pipelines"
    description="Create, browse, and open transformation pipelines."
  >
    <RouterLink class="btn-primary" to="/pipelines/new"
      >Create pipeline</RouterLink
    >
  </PageHeader>

  <LoadingState v-if="store.loading" />
  <EmptyState
    v-else-if="store.items.length === 0"
    title="No pipelines yet"
    description="Create your first pipeline to start mapping sample payloads."
  >
    <RouterLink class="btn-primary" to="/pipelines/new"
      >New pipeline</RouterLink
    >
  </EmptyState>
  <PipelineList v-else :pipelines="store.items" />
</template>
