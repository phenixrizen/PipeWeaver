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
  savedSnapshot?: string;
  preview?: PreviewResult;
  loading: boolean;
  error?: string;
}

const readConfigString = (value: unknown) =>
  typeof value === "string" ? value : "";

const applyEditorSamples = (
  pipeline: PipelineDefinition,
  samplePayload: string,
  sampleOutput: string,
) => {
  const nextPipeline = JSON.parse(JSON.stringify(pipeline)) as PipelineDefinition;

  if (
    !nextPipeline.source.config ||
    typeof nextPipeline.source.config !== "object"
  ) {
    nextPipeline.source.config = {};
  }
  if (
    !nextPipeline.target.config ||
    typeof nextPipeline.target.config !== "object"
  ) {
    nextPipeline.target.config = {};
  }

  if (samplePayload.trim()) {
    nextPipeline.source.config.samplePayload = samplePayload;
  } else {
    delete nextPipeline.source.config.samplePayload;
  }

  if (sampleOutput.trim()) {
    nextPipeline.target.config.sampleOutput = sampleOutput;
  } else {
    delete nextPipeline.target.config.sampleOutput;
  }

  return nextPipeline;
};

const serializePipelineSnapshot = (
  pipeline: PipelineDefinition,
  samplePayload: string,
  sampleOutput: string,
) =>
  JSON.stringify(applyEditorSamples(pipeline, samplePayload, sampleOutput));

// usePipelineStore centralizes editor state so route views stay focused on layout and composition.
export const usePipelineStore = defineStore("pipelines", {
  state: (): PipelineState => ({
    pipelines: [],
    current: blankPipeline(),
    samplePayload: blankSamplePayload,
    sampleOutput: blankSampleOutput,
    savedSnapshot: undefined,
    preview: undefined,
    loading: false,
    error: undefined,
  }),
  getters: {
    isCurrentSaved: (state) =>
      Boolean(
        state.savedSnapshot &&
          state.savedSnapshot ===
            serializePipelineSnapshot(
              state.current,
              state.samplePayload,
              state.sampleOutput,
            ),
      ),
  },
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
      this.savedSnapshot = undefined;
    },
    async loadPipeline(id: string) {
      this.loading = true;
      try {
        this.current = await api.getPipeline(id);
        this.samplePayload = readConfigString(this.current.source.config?.samplePayload);
        this.sampleOutput = readConfigString(this.current.target.config?.sampleOutput);
        this.savedSnapshot = serializePipelineSnapshot(
          this.current,
          this.samplePayload,
          this.sampleOutput,
        );
      } finally {
        this.loading = false;
      }
    },
    async saveCurrent() {
      this.loading = true;
      this.error = undefined;
      try {
        const persistedPipeline = applyEditorSamples(
          this.current,
          this.samplePayload,
          this.sampleOutput,
        );
        this.current = await api.savePipeline(persistedPipeline);
        this.samplePayload = readConfigString(this.current.source.config?.samplePayload);
        this.sampleOutput = readConfigString(this.current.target.config?.sampleOutput);
        this.savedSnapshot = serializePipelineSnapshot(
          this.current,
          this.samplePayload,
          this.sampleOutput,
        );
        await this.loadPipelines();
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : "Failed to save pipeline";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async deletePipeline(id: string) {
      this.loading = true;
      this.error = undefined;
      try {
        await api.deletePipeline(id);
        this.pipelines = this.pipelines.filter(
          (pipeline) => pipeline.pipeline.id !== id,
        );

        if (this.current.pipeline.id === id) {
          this.createDraft();
        }
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : "Failed to delete pipeline";
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
