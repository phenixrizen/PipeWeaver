import { defineStore } from "pinia";

import {
  getPipeline,
  listPipelines,
  previewPipeline,
  savePipeline,
} from "@/lib/api";
import type { PipelineDefinition, PreviewResult } from "@/types/pipeline";

// createEmptyPipeline gives the editor a stable shape for new documents.
export function createEmptyPipeline(): PipelineDefinition {
  return {
    id: "pipeline-" + Math.random().toString(36).slice(2, 8),
    name: "New pipeline",
    description: "",
    source: { type: "http", format: "json", config: {} },
    target: { type: "stdout", format: "json", config: {} },
    mapping: {
      fields: [{ from: "", to: "", required: false, transforms: [] }],
    },
    sampleInput: '{\n  "example": true\n}',
    targetSchema: { name: "target-schema", fields: [] },
  };
}

// usePipelineStore centralizes API-backed state for list, editor, and preview flows.
export const usePipelineStore = defineStore("pipelines", {
  state: () => ({
    items: [] as PipelineDefinition[],
    current: createEmptyPipeline(),
    preview: null as PreviewResult | null,
    loading: false,
    error: "",
  }),
  actions: {
    async loadAll() {
      this.loading = true;
      this.error = "";
      try {
        this.items = await listPipelines();
      } catch (error) {
        this.error = (error as Error).message;
      } finally {
        this.loading = false;
      }
    },
    async loadOne(id: string) {
      this.loading = true;
      this.error = "";
      try {
        this.current = await getPipeline(id);
      } catch (error) {
        this.error = (error as Error).message;
      } finally {
        this.loading = false;
      }
    },
    setCurrent(pipeline: PipelineDefinition) {
      this.current = pipeline;
    },
    async saveCurrent() {
      this.error = "";
      this.current = await savePipeline(this.current);
      await this.loadAll();
    },
    async runPreview(input?: string) {
      this.error = "";
      this.preview = await previewPipeline(
        this.current,
        input ?? this.current.sampleInput ?? "",
      );
    },
  },
});
