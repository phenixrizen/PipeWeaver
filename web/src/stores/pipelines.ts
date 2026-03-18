import { defineStore } from "pinia";
import { api } from "../lib/api";
import { defaultPipeline, defaultSamplePayload } from "../lib/defaults";
import type { PipelineDefinition, PreviewResult } from "../types/pipeline";

interface PipelineState {
  pipelines: PipelineDefinition[];
  current: PipelineDefinition;
  samplePayload: string;
  preview?: PreviewResult;
  loading: boolean;
  error?: string;
}

// usePipelineStore centralizes editor state so route views stay focused on layout and composition.
export const usePipelineStore = defineStore("pipelines", {
  state: (): PipelineState => ({
    pipelines: [],
    current: defaultPipeline(),
    samplePayload: defaultSamplePayload,
    preview: undefined,
    loading: false,
    error: undefined,
  }),
  actions: {
    async loadPipelines() {
      this.loading = true;
      this.error = undefined;
      try {
        this.pipelines = await api.listPipelines();
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : "Failed to load pipelines";
      } finally {
        this.loading = false;
      }
    },
    createDraft() {
      this.current = defaultPipeline();
      this.preview = undefined;
      this.samplePayload = defaultSamplePayload;
    },
    async loadPipeline(id: string) {
      this.loading = true;
      try {
        this.current = await api.getPipeline(id);
      } finally {
        this.loading = false;
      }
    },
    async saveCurrent() {
      this.loading = true;
      this.error = undefined;
      try {
        this.current = await api.savePipeline(this.current);
        await this.loadPipelines();
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : "Failed to save pipeline";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async runPreview() {
      this.loading = true;
      this.error = undefined;
      try {
        this.preview = await api.preview(this.current, this.samplePayload);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Preview failed";
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
