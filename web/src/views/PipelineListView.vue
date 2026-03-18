<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import EmptyState from "../components/EmptyState.vue";
import LoadingState from "../components/LoadingState.vue";
import PageHeader from "../components/PageHeader.vue";
import PipelineList from "../components/PipelineList.vue";
import { usePipelineStore } from "../stores/pipelines";

const store = usePipelineStore();

onMounted(() => {
  void store.loadPipelines();
});
</script>

<template>
  <div>
    <PageHeader
      title="Pipelines"
      description="Create, store, and refine declarative mappings with fast preview feedback."
    >
      <RouterLink class="button-primary" to="/pipelines/new"
        >New pipeline</RouterLink
      >
    </PageHeader>

    <LoadingState v-if="store.loading && !store.pipelines.length" />
    <EmptyState
      v-else-if="!store.pipelines.length"
      title="No pipelines yet"
      message="Start with a draft pipeline and evolve it into a reusable mapping workflow."
    >
      <RouterLink class="button-primary" to="/pipelines/new"
        >Create your first pipeline</RouterLink
      >
    </EmptyState>
    <PipelineList v-else :pipelines="store.pipelines" />
  </div>
</template>
