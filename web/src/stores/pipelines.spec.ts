import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import { blankPipeline } from "../lib/defaults";
import { usePipelineStore } from "./pipelines";

const {
  getPipelineSpy,
  listPipelinesSpy,
  previewSpy,
  savePipelineSpy,
} = vi.hoisted(() => ({
  getPipelineSpy: vi.fn(),
  listPipelinesSpy: vi.fn(),
  previewSpy: vi.fn(),
  savePipelineSpy: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    getPipeline: getPipelineSpy,
    listPipelines: listPipelinesSpy,
    preview: previewSpy,
    savePipeline: savePipelineSpy,
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  getPipelineSpy.mockReset();
  listPipelinesSpy.mockReset();
  previewSpy.mockReset();
  savePipelineSpy.mockReset();
  listPipelinesSpy.mockResolvedValue([]);
  savePipelineSpy.mockImplementation(async (pipeline: unknown) => pipeline);
});

it("persists editor samples into the saved pipeline config", async () => {
  const store = usePipelineStore();
  store.current = blankPipeline();
  store.current.pipeline.id = "claims";
  store.current.source.type = "http";
  store.current.source.format = "xml";
  store.current.target.type = "stdout";
  store.current.target.format = "csv";
  store.samplePayload = "<envelope><claim><name>Bob</name></claim></envelope>";
  store.sampleOutput = "name\nBob";

  await store.saveCurrent();

  expect(savePipelineSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      source: expect.objectContaining({
        config: expect.objectContaining({
          samplePayload:
            "<envelope><claim><name>Bob</name></claim></envelope>",
        }),
      }),
      target: expect.objectContaining({
        config: expect.objectContaining({
          sampleOutput: "name\nBob",
        }),
      }),
    }),
  );
});

it("hydrates editor samples from the stored pipeline config", async () => {
  const pipeline = blankPipeline();
  pipeline.pipeline.id = "claims";
  pipeline.source.config = {
    samplePayload: "<envelope><claim><name>Bob</name></claim></envelope>",
  };
  pipeline.target.config = {
    sampleOutput: "name,code\nBob,12345\nBob,67890",
  };
  getPipelineSpy.mockResolvedValue(pipeline);

  const store = usePipelineStore();
  await store.loadPipeline("claims");

  expect(store.samplePayload).toBe(
    "<envelope><claim><name>Bob</name></claim></envelope>",
  );
  expect(store.sampleOutput).toBe("name,code\nBob,12345\nBob,67890");
});

it("tracks whether the current pipeline has a stable saved snapshot", async () => {
  const store = usePipelineStore();
  store.current = blankPipeline();
  store.current.pipeline.id = "claims";
  store.current.pipeline.name = "Claims export";
  store.current.source.type = "http";
  store.current.source.format = "xml";
  store.current.target.type = "stdout";
  store.current.target.format = "csv";
  store.samplePayload = "<envelope><claim><name>Bob</name></claim></envelope>";

  expect(store.isCurrentSaved).toBe(false);

  await store.saveCurrent();

  expect(store.isCurrentSaved).toBe(true);

  store.current.pipeline.name = "Claims export v2";

  expect(store.isCurrentSaved).toBe(false);

  store.createDraft();

  expect(store.isCurrentSaved).toBe(false);
});
