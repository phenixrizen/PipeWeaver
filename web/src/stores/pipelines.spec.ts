import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import { blankPipeline } from "../lib/defaults";
import { usePipelineStore } from "./pipelines";

const {
  deletePipelineSpy,
  getPipelineSpy,
  listPipelinesSpy,
  previewSpy,
  savePipelineSpy,
} = vi.hoisted(() => ({
  deletePipelineSpy: vi.fn(),
  getPipelineSpy: vi.fn(),
  listPipelinesSpy: vi.fn(),
  previewSpy: vi.fn(),
  savePipelineSpy: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    deletePipeline: deletePipelineSpy,
    getPipeline: getPipelineSpy,
    listPipelines: listPipelinesSpy,
    preview: previewSpy,
    savePipeline: savePipelineSpy,
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  deletePipelineSpy.mockReset();
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

it("removes deleted pipelines from the catalog state", async () => {
  const store = usePipelineStore();
  store.pipelines = [blankPipeline(), blankPipeline()];
  store.pipelines[0].pipeline.id = "alpha";
  store.pipelines[0].pipeline.name = "Alpha";
  store.pipelines[1].pipeline.id = "beta";
  store.pipelines[1].pipeline.name = "Beta";
  store.current = blankPipeline();
  store.current.pipeline.id = "alpha";

  await store.deletePipeline("alpha");

  expect(deletePipelineSpy).toHaveBeenCalledWith("alpha");
  expect(store.pipelines.map((pipeline) => pipeline.pipeline.id)).toEqual(["beta"]);
  expect(store.current.pipeline.id).toBe("");
});
