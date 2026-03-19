import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PipelineAiAssistant from "./PipelineAiAssistant.vue";
import { structuredAiResponseSchema } from "../lib/ai";
import { defaultPipeline, defaultSamplePayload } from "../lib/defaults";

const {
  createCompletionSpy,
  createEngineSpy,
  hasModelInCacheSpy,
  interruptGenerateSpy,
} = vi.hoisted(() => ({
  createCompletionSpy: vi.fn(),
  createEngineSpy: vi.fn(),
  hasModelInCacheSpy: vi.fn(),
  interruptGenerateSpy: vi.fn(),
}));

vi.mock("@mlc-ai/web-llm", () => ({
  CreateMLCEngine: createEngineSpy,
  hasModelInCache: hasModelInCacheSpy,
}));

vi.mock("../lib/webllm", () => ({
  loadWebLLM: vi.fn(async () => ({
    CreateMLCEngine: createEngineSpy,
    hasModelInCache: hasModelInCacheSpy,
  })),
}));

const MonacoStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    label: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  template: `
    <label>
      <span>{{ label }}</span>
      <textarea
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </label>
  `,
});

const streamFromChunks = (chunks: string[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield {
        choices: [
          {
            delta: {
              content: chunk,
            },
          },
        ],
      };
    }
  },
});

const controlledAbortStream = (
  firstChunk: string,
  onWait: (release: () => void) => void,
) => ({
  async *[Symbol.asyncIterator]() {
    yield {
      choices: [
        {
          delta: {
            content: firstChunk,
          },
        },
      ],
    };

    await new Promise<void>((resolve) => onWait(resolve));

    yield {
      choices: [
        {
          delta: {
            content: "",
          },
          finish_reason: "abort",
        },
      ],
    };
  },
});

beforeEach(() => {
  createCompletionSpy.mockReset();
  createEngineSpy.mockReset();
  hasModelInCacheSpy.mockReset();
  interruptGenerateSpy.mockReset();
  createCompletionSpy.mockResolvedValue(
    streamFromChunks(['{"summary":"Ready","mappingFields":[]}']),
  );
  hasModelInCacheSpy.mockResolvedValue(true);
  createEngineSpy.mockResolvedValue({
    interruptGenerate: interruptGenerateSpy,
    chat: {
      completions: {
        create: createCompletionSpy,
      },
    },
  });
  Object.defineProperty(window.navigator, "gpu", {
    value: {},
    configurable: true,
  });
});

afterEach(() => {
  createCompletionSpy.mockReset();
  createEngineSpy.mockReset();
  hasModelInCacheSpy.mockReset();
  interruptGenerateSpy.mockReset();
});

it("shows model size metadata and browser cache status", async () => {
  const pipeline = defaultPipeline();

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  await flushPromises();

  const modelOptions = wrapper.get('[data-testid="ai-model-select"]').findAll("option");
  expect(modelOptions[0].text()).toContain("Llama 3.1 · 8B · ~5.0 GB VRAM");
  expect(wrapper.get('[data-testid="ai-model-cache-status"]').text()).toContain(
    "Cached in browser",
  );
});

it("passes the configured max_tokens value into local generation", async () => {
  const pipeline = defaultPipeline();

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  await wrapper.get('[data-testid="ai-max-tokens-input"]').setValue("2048");
  await wrapper.get('[data-testid="ai-generate-button"]').trigger("click");
  await flushPromises();
  await flushPromises();

  expect(createEngineSpy).toHaveBeenCalled();
  expect(createCompletionSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      max_tokens: 2048,
      stream: true,
      response_format: {
        type: "json_object",
        schema: structuredAiResponseSchema,
      },
    }),
  );
});

it("assembles streamed chunks into the AI response editor", async () => {
  createCompletionSpy.mockResolvedValue(
    streamFromChunks(['{"summary":"Re', 'ady","mappingFields":[]}']),
  );

  const pipeline = defaultPipeline();

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  await wrapper.get('[data-testid="ai-generate-button"]').trigger("click");
  await flushPromises();
  await flushPromises();

  const textareas = wrapper.findAll("textarea");
  const responseEditor = textareas[textareas.length - 1];

  expect((responseEditor.element as HTMLTextAreaElement).value).toBe(
    '{\n  "summary": "Ready",\n  "mappingFields": []\n}',
  );
  expect(wrapper.text()).toContain("Ready");
});

it("cancels a streaming generation and keeps the partial output", async () => {
  let releaseStream: () => void = () => {};
  createCompletionSpy.mockResolvedValue(
    controlledAbortStream('{"summary":"Par', (release) => {
      releaseStream = release;
    }),
  );
  interruptGenerateSpy.mockImplementation(() => {
    releaseStream();
  });

  const pipeline = defaultPipeline();

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  await wrapper.get('[data-testid="ai-generate-button"]').trigger("click");
  await flushPromises();
  await wrapper.get('[data-testid="ai-cancel-button"]').trigger("click");
  await flushPromises();
  await flushPromises();

  const textareas = wrapper.findAll("textarea");
  const responseEditor = textareas[textareas.length - 1];

  expect(interruptGenerateSpy).toHaveBeenCalled();
  expect((responseEditor.element as HTMLTextAreaElement).value).toBe(
    '{"summary":"Par',
  );
  expect(wrapper.text()).toContain("Generation cancelled");
});

it("renders explain mode output as markdown instead of requiring JSON", async () => {
  createCompletionSpy.mockResolvedValue(
    streamFromChunks([
      "## What this pipeline does\nTurns incoming rows into claims exports.\n\n## Review next\nConfirm the target schema.",
    ]),
  );

  const pipeline = defaultPipeline();

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: defaultSamplePayload,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  const selects = wrapper.findAll("select");
  await selects[1].setValue("explain");
  await wrapper.get('[data-testid="ai-generate-button"]').trigger("click");
  await flushPromises();
  await flushPromises();

  const textareas = wrapper.findAll("textarea");
  const responseEditor = textareas[textareas.length - 1];

  expect((responseEditor.element as HTMLTextAreaElement).value).toContain(
    "## What this pipeline does",
  );
  expect(wrapper.text()).toContain("AI explanation");
  expect(wrapper.text()).not.toContain("Apply all");
  expect(createCompletionSpy).toHaveBeenCalledWith(
    expect.not.objectContaining({
      response_format: expect.anything(),
    }),
  );
});

it("auto-applies structured wizard drafts while keeping a sample-locked target schema", async () => {
  createCompletionSpy.mockResolvedValue(
    streamFromChunks([
      '{"summary":"Ready","pipelineDescription":"Refined description","targetSchema":{"type":"object","fields":[{"name":"should_not_replace","type":"string"}]},"mappingFields":[{"from":"claim.name","to":"claimant_name","transforms":[]}]}',
    ]),
  );

  const pipeline = defaultPipeline();
  pipeline.targetSchema = {
    type: "object",
    fields: [{ name: "claimant_name", type: "string" }],
  };

  const wrapper = mount(PipelineAiAssistant, {
    props: {
      pipeline,
      samplePayload: "<envelope><claim><name>Bob</name></claim></envelope>",
      sampleOutput: "claimant_name\nBob",
      autoApplyStructured: true,
      hideApplyActions: true,
      lockTargetSchema: true,
      "onUpdate:pipeline": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
      },
    },
  });

  await wrapper.get('[data-testid="ai-generate-button"]').trigger("click");
  await flushPromises();
  await flushPromises();

  expect(pipeline.pipeline.description).toBe("Refined description");
  expect(pipeline.mapping.fields).toEqual([
    { from: "claim.name", to: "claimant_name", transforms: [] },
  ]);
  expect(pipeline.targetSchema).toEqual({
    type: "object",
    fields: [{ name: "claimant_name", type: "string" }],
  });
});
