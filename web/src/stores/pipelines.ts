import { defineStore } from "pinia";
import { api } from "../lib/api";
import {
  blankPipeline,
  blankSampleOutput,
  blankSamplePayload,
} from "../lib/defaults";
import type { PipelineDefinition, PreviewResult } from "../types/pipeline";

interface PipelineState {
  pipelines: PipelineDefinition[];
  current: PipelineDefinition;
  samplePayload: string;
  sampleOutput: string;
  preview?: PreviewResult;
  loading: boolean;
  error?: string;
}

const readConfigString = (value: unknown) =>
  typeof value === "string" ? value : "";

const syncEditorSamples = (state: PipelineState) => {
  if (!state.current.source.config || typeof state.current.source.config !== "object") {
    state.current.source.config = {};
  }
  if (!state.current.target.config || typeof state.current.target.config !== "object") {
    state.current.target.config = {};
  }

  if (state.samplePayload.trim()) {
    state.current.source.config.samplePayload = state.samplePayload;
  } else {
    delete state.current.source.config.samplePayload;
  }

  if (state.sampleOutput.trim()) {
    state.current.target.config.sampleOutput = state.sampleOutput;
  } else {
    delete state.current.target.config.sampleOutput;
  }
};

// usePipelineStore centralizes editor state so route views stay focused on layout and composition.
export const usePipelineStore = defineStore("pipelines", {
  state: (): PipelineState => ({
    pipelines: [],
    current: blankPipeline(),
    samplePayload: blankSamplePayload,
    sampleOutput: blankSampleOutput,
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
      this.current = blankPipeline();
      this.preview = undefined;
      this.samplePayload = blankSamplePayload;
      this.sampleOutput = blankSampleOutput;
    },
    async loadPipeline(id: string) {
      this.loading = true;
      try {
        this.current = await api.getPipeline(id);
        this.samplePayload = readConfigString(this.current.source.config?.samplePayload);
        this.sampleOutput = readConfigString(this.current.target.config?.sampleOutput);
      } finally {
        this.loading = false;
      }
    },
    async saveCurrent() {
      this.loading = true;
      this.error = undefined;
      try {
        syncEditorSamples(this);
        this.current = await api.savePipeline(this.current);
        this.samplePayload = readConfigString(this.current.source.config?.samplePayload);
        this.sampleOutput = readConfigString(this.current.target.config?.sampleOutput);
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
