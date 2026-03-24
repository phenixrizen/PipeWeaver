import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";
import NewPipelineWizard from "./NewPipelineWizard.vue";
import { blankPipeline } from "../lib/defaults";

const {
  generateForTargetsImpl,
  generateForTargetsSpy,
  reviewSuggestedMatchImpl,
  reviewSuggestedMatchSpy,
  cancelGenerationSpy,
} = vi.hoisted(() => ({
  generateForTargetsImpl: vi.fn(),
  generateForTargetsSpy: vi.fn(),
  reviewSuggestedMatchImpl: vi.fn(),
  reviewSuggestedMatchSpy: vi.fn(),
  cancelGenerationSpy: vi.fn(),
}));

const SamplePayloadEditorStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    format: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue", "detected-format"],
  template: '<div data-testid="sample-payload-stub">{{ format }}</div>',
});

const MonacoStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  template: `
    <textarea
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
});

const PipelineAiAssistantStub = defineComponent({
  props: {
    pipeline: {
      type: Object,
      required: true,
    },
    defaultModelId: {
      type: String,
      default: "",
    },
    hideStatusPanel: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["generated", "progress"],
  setup(props, { emit, expose }) {
    const isBusy = ref(false);

    const generateForTargets = async (targetPaths: string[]) => {
      generateForTargetsSpy(targetPaths);
      isBusy.value = true;
      emit("progress", {
        busy: true,
        status: "Generating",
        step: "Streaming partial response",
        elapsedSeconds: 1,
        elapsedLabel: "1s",
        detail: "Receiving partial output from the local model.",
        responseText: "draft incoming",
        wordsReceived: 2,
        errorMessage: "",
        modelId: props.defaultModelId,
        modelLabel: props.defaultModelId.includes("Qwen")
          ? "Qwen 2.5 · 1.5B · ~1.6 GB VRAM"
          : "Stub model",
        scopedTargetLabel: targetPaths[0] ?? "",
        canCancel: true,
      });
      await generateForTargetsImpl({
        emit,
        pipeline: props.pipeline as ReturnType<typeof blankPipeline>,
        targetPaths,
        defaultModelId: props.defaultModelId,
      });
      isBusy.value = false;
      emit("progress", {
        busy: false,
        status: "Draft ready",
        step: "Draft ready",
        elapsedSeconds: 2,
        elapsedLabel: "2s",
        detail: "Draft generated locally.",
        responseText: "draft incoming",
        wordsReceived: 2,
        errorMessage: "",
        modelId: props.defaultModelId,
        modelLabel: props.defaultModelId.includes("Qwen")
          ? "Qwen 2.5 · 1.5B · ~1.6 GB VRAM"
          : "Stub model",
        scopedTargetLabel: targetPaths[0] ?? "",
        canCancel: false,
      });
    };

    const reviewSuggestedMatch = async (options: {
      targetPath: string;
      candidateSource: string;
      sourceSamplePreview: string;
      targetSamplePreview: string;
    }) => {
      reviewSuggestedMatchSpy(options);
      isBusy.value = true;
      emit("progress", {
        busy: true,
        status: "Generating",
        step: "Streaming partial response",
        elapsedSeconds: 1,
        elapsedLabel: "1s",
        detail: "Reviewing the displayed local candidate.",
        responseText: "review incoming",
        wordsReceived: 2,
        errorMessage: "",
        modelId: props.defaultModelId,
        modelLabel: props.defaultModelId.includes("Qwen")
          ? "Qwen 2.5 · 1.5B · ~1.6 GB VRAM"
          : "Stub model",
        scopedTargetLabel: options.targetPath,
        canCancel: true,
      });
      const result = await reviewSuggestedMatchImpl({
        emit,
        pipeline: props.pipeline as ReturnType<typeof blankPipeline>,
        options,
        defaultModelId: props.defaultModelId,
      });
      isBusy.value = false;
      emit("progress", {
        busy: false,
        status: result?.approved ? "Review approved" : "Review rejected",
        step: result?.approved ? "Review approved" : "Review rejected",
        elapsedSeconds: 2,
        elapsedLabel: "2s",
        detail: result?.summary ?? "Review unavailable.",
        responseText: "review incoming",
        wordsReceived: 2,
        errorMessage: "",
        modelId: props.defaultModelId,
        modelLabel: props.defaultModelId.includes("Qwen")
          ? "Qwen 2.5 · 1.5B · ~1.6 GB VRAM"
          : "Stub model",
        scopedTargetLabel: options.targetPath,
        canCancel: false,
      });
      return result;
    };

    const cancelGeneration = async () => {
      cancelGenerationSpy();
      isBusy.value = false;
      emit("progress", {
        busy: false,
        status: "Generation cancelled",
        step: "Generation cancelled",
        elapsedSeconds: 1,
        elapsedLabel: "1s",
        detail: "Stopped the local model.",
        responseText: "draft incoming",
        wordsReceived: 2,
        errorMessage: "",
        modelId: props.defaultModelId,
        modelLabel: props.defaultModelId.includes("Qwen")
          ? "Qwen 2.5 · 1.5B · ~1.6 GB VRAM"
          : "Stub model",
        scopedTargetLabel: "",
        canCancel: false,
      });
    };

    expose({
      generateForTargets,
      reviewSuggestedMatch,
      cancelGeneration,
      isBusy,
    });

    return { cancelGeneration, generateForTargets, reviewSuggestedMatch, isBusy };
  },
  template: `
    <div
      data-testid="wizard-ai-stub"
      :data-default-model-id="defaultModelId"
      :data-hide-status-panel="String(hideStatusPanel)"
    >
      {{ isBusy ? "busy" : "idle" }}
      <button
        type="button"
        data-testid="wizard-ai-generate-button"
        :disabled="isBusy"
        @click="generateForTargets([])"
      >
        Generate
      </button>
      <button
        type="button"
        data-testid="wizard-ai-cancel-button"
        :disabled="!isBusy"
        @click="cancelGeneration"
      >
        Cancel
      </button>
    </div>
  `,
});

beforeEach(() => {
  generateForTargetsImpl.mockReset();
  generateForTargetsSpy.mockReset();
  reviewSuggestedMatchImpl.mockReset();
  reviewSuggestedMatchSpy.mockReset();
  cancelGenerationSpy.mockReset();
  generateForTargetsImpl.mockImplementation(async ({ emit, pipeline, targetPaths }) => {
    const targetPath = targetPaths[0] ?? "";
    if (!targetPath) {
      return;
    }

    const nextMapping = {
      from: `ai.${targetPath}`,
      to: targetPath,
      required: false,
      expression: "",
      transforms: [],
    };
    pipeline.mapping.fields.push(nextMapping);
    emit("generated", {
      mode: "mapping",
      structured: true,
      summary: `AI resolved ${targetPath}`,
      responseText: JSON.stringify({
        summary: `AI resolved ${targetPath}`,
        mappingFields: [nextMapping],
      }),
      parsedResponse: {
        summary: `AI resolved ${targetPath}`,
        mappingFields: [nextMapping],
      },
    });
  });
  reviewSuggestedMatchImpl.mockImplementation(async ({ options }) => ({
    approved: true,
    confidence: "high",
    summary: `Approved ${options.targetPath}`,
    rationale:
      "The target label and sample align with the displayed local candidate.",
  }));
});

it("slugifies the pipeline name until the id is edited manually", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );

  expect(pipeline.pipeline.id).toBe("claims-intake-to-csv");

  await wrapper.get('[data-testid="wizard-id-input"]').setValue("claims-v2");
  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Updated pipeline name",
  );

  expect(pipeline.pipeline.id).toBe("claims-v2");
});

it("disables future stage buttons until those stages have been visited", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  expect(
    wrapper.get('[data-testid="wizard-step-button-2"]').attributes("disabled"),
  ).toBeDefined();

  await wrapper.get('[data-testid="wizard-step-button-2"]').trigger("click");

  expect(wrapper.text()).toContain("Name the pipeline");

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  expect(
    wrapper.get('[data-testid="wizard-step-button-0"]').attributes("disabled"),
  ).toBeUndefined();
  expect(
    wrapper.get('[data-testid="wizard-step-button-2"]').attributes("disabled"),
  ).toBeDefined();
});

it("lets the user click back to an already visited stage", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  expect(
    wrapper.get('[data-testid="wizard-step-button-1"]').attributes("disabled"),
  ).toBeUndefined();

  await wrapper.get('[data-testid="wizard-step-button-1"]').trigger("click");

  expect(wrapper.text()).toContain("Configure the source");
});

it("emits complete with an empty target schema tailored to the chosen target format", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.find('input[type="checkbox"]').setValue(true);
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();
  expect(wrapper.find('[data-testid="wizard-ai-stub"]').exists()).toBe(true);

  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");

  expect(wrapper.emitted("complete")).toBeTruthy();
  expect(pipeline.target.config.responseMode).toBe("reply");
  expect(pipeline.targetSchema).toEqual({
    type: "object",
    fields: [],
    name: undefined,
  });
});

it("infers the target schema from the sample output before opening the editor", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "<envelope><claim><name>Bob</name></claim></envelope>",
      sampleOutput: "claim_id,claimant_name\nCLM-1,Bob",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();
  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");
  await flushPromises();

  expect(pipeline.targetSchema?.fields.map((field) => field.name)).toEqual([
    "claim_id",
    "claimant_name",
  ]);
});

it("auto-selects the target format when the sample output editor detects one", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sampleEditors = wrapper.findAllComponents(SamplePayloadEditorStub);
  sampleEditors[0].vm.$emit("detected-format", "json");
  await wrapper.vm.$nextTick();

  expect(pipeline.target.format).toBe("json");
});

it("shows guided target empty-state content instead of a blank card when moving from source to target", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: "",
      sampleOutput: "",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        MonacoCodeEditor: MonacoStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  expect(wrapper.text()).toContain("No sample output loaded yet");
  expect(wrapper.text()).toContain("Select a target format above");
});

it("infers a primary row driver when the target sample fans repeated xml values into rows", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <name>Bob</name>
    <codes>
      <code>12345</code>
      <code>67890</code>
    </codes>
  </claim>
</envelope>`,
      sampleOutput: "name,code\nBob,12345\nBob,67890",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();
  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");
  await flushPromises();

  expect(pipeline.mapping.fields).toEqual([
    {
      from: "claim.name",
      to: "name",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
    {
      from: "claim.codes.code",
      to: "code",
      required: false,
      expression: "",
      repeatMode: "inherit",
      transforms: [],
    },
  ]);
  expect(pipeline.mapping.rowDriverPath).toBe("claim.codes.code");
});

it("lets the user override the inferred row driver from the wizard", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <lines>
      <line>
        <number>1</number>
        <procedureCode>PROC-A</procedureCode>
      </line>
      <line>
        <number>2</number>
        <procedureCode>PROC-B</procedureCode>
      </line>
    </lines>
    <diagnoses>
      <diagnosis>
        <code>D1</code>
      </diagnosis>
      <diagnosis>
        <code>D2</code>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput:
        "line_number,procedure_code,diagnosis_code\n1,PROC-A,D1\n2,PROC-B,D2",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(pipeline.mapping.rowDriverPath).toBe("claim.lines.line");

  await wrapper
    .get('[data-testid="wizard-row-driver-select"]')
    .setValue("claim.diagnoses.diagnosis");

  expect(pipeline.mapping.rowDriverPath).toBe("claim.diagnoses.diagnosis");
});

it("skips the AI fallback when high-confidence local matching resolves every target", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: '{"customer":{"name":"Ada Lovelace","id":"1001"}}',
      sampleOutput: "customer_name\nAda Lovelace",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("json");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(wrapper.find('[data-testid="wizard-ai-stub"]').exists()).toBe(false);
  expect(wrapper.text()).toContain("AI fallback not needed");

  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");

  expect(pipeline.mapping.fields).toEqual([
    {
      from: "customer.name",
      to: "customer_name",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
  ]);
});

it("shows likely local matches for indexed targets and lets the user apply them without the AI", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput: "Health_Care_Diagnosis_Code_1\nF84.0",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(wrapper.text()).toContain("Likely local matches");
  expect(wrapper.text()).toContain(
    "claim.diagnoses.diagnosis[1].codeValue",
  );
  expect(wrapper.text()).toContain("Source sample");
  expect(wrapper.text()).toContain("Target sample");
  expect(wrapper.text()).toContain("F84.0");
  expect(wrapper.find('[data-testid="wizard-ai-stub"]').exists()).toBe(true);

  await wrapper.get('[data-testid="wizard-apply-likely-button"]').trigger("click");
  await flushPromises();

  expect(pipeline.mapping.fields).toContainEqual({
    from: "claim.diagnoses.diagnosis[1].codeValue",
    to: "Health_Care_Diagnosis_Code_1",
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
  expect(wrapper.find('[data-testid="wizard-ai-stub"]').exists()).toBe(false);
});

it("opens the generate step immediately and keeps local preparation inside the progress modal", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: '{"customer":{"name":"Ada Lovelace"}}',
      sampleOutput: "customer_name\nAda Lovelace",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("json");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  expect(wrapper.find('[data-testid="generation-progress-modal"]').exists()).toBe(true);
  expect(wrapper.text()).toContain("Preparing local draft");
  expect(wrapper.text()).toContain("Status");
  expect(wrapper.text()).toContain("Step");
  expect(wrapper.text()).toContain("Elapsed");
  expect(wrapper.text()).toContain("Detail");

  expect(pipeline.targetSchema?.fields.map((field) => field.name)).toEqual([
    "customer_name",
  ]);
  expect(wrapper.text()).toContain("Generate from samples");

  await flushPromises();

  expect(wrapper.find('[data-testid="generation-progress-modal"]').exists()).toBe(false);
});

it("passes the wizard-specific fast model default into the assistant and hides the inline status panel", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput: "Health_Care_Diagnosis_Code_1\nF84.0",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  const assistant = wrapper.get('[data-testid="wizard-ai-stub"]');
  expect(assistant.attributes("data-default-model-id")).toBe(
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  );
  expect(assistant.attributes("data-hide-status-panel")).toBe("true");
});

it("shows and persists the optional data context field on the generate step", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: '{"customer":{"name":"Ada Lovelace"}}',
      sampleOutput: "customer_name\nAda Lovelace",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("json");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(wrapper.text()).toContain("AI fallback not needed");

  await wrapper
    .get('[data-testid="wizard-ai-context-input"]')
    .setValue("One output row is one normalized customer record.");

  expect(pipeline.pipeline.aiContext).toBe(
    "One output row is one normalized customer record.",
  );
});

it("reuses the same modal for AI progress with streamed text and live word counts", async () => {
  let releaseGeneration: (() => void) | undefined;
  generateForTargetsImpl.mockImplementation(
    async ({ emit }) =>
      new Promise<void>((resolve) => {
        emit("progress", {
          busy: true,
          status: "Generating",
          step: "Streaming partial response",
          elapsedSeconds: 3,
          elapsedLabel: "3s",
          detail: "Receiving partial output from the local model.",
          responseText: "mapping draft in progress",
          wordsReceived: 4,
          errorMessage: "",
          modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
          modelLabel: "Qwen 2.5 · 1.5B · ~1.6 GB VRAM",
          scopedTargetLabel: "",
          canCancel: true,
        });
        releaseGeneration = () => {
          emit("progress", {
            busy: false,
            status: "Draft ready",
            step: "Draft ready",
            elapsedSeconds: 4,
            elapsedLabel: "4s",
            detail: "Draft generated locally.",
            responseText: "mapping draft in progress",
            wordsReceived: 4,
            errorMessage: "",
            modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
            modelLabel: "Qwen 2.5 · 1.5B · ~1.6 GB VRAM",
            scopedTargetLabel: "",
            canCancel: false,
          });
          resolve();
        };
      }),
  );

  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput: "Health_Care_Diagnosis_Code_1\nF84.0",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  await wrapper.get('[data-testid="wizard-ai-generate-button"]').trigger("click");
  await wrapper.vm.$nextTick();

  expect(wrapper.find('[data-testid="generation-progress-modal"]').exists()).toBe(true);
  expect(wrapper.text()).toContain("Generating");
  expect(wrapper.text()).toContain("Streaming partial response");
  expect(wrapper.text()).toContain("mapping draft in progress");
  expect(wrapper.get('[data-testid="generation-progress-words"]').text()).toContain("4");

  releaseGeneration?.();
  await flushPromises();

  expect(wrapper.find('[data-testid="generation-progress-modal"]').exists()).toBe(false);
});

it("skips the AI fallback when only unsupported targets remain", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: '{"claim":{"id":"CLM-1"}}',
      sampleOutput: "subscriber_city,rendering_provider_npi\nSan Francisco,12345",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("json");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(wrapper.find('[data-testid="wizard-ai-stub"]').exists()).toBe(false);
  expect(wrapper.text()).toContain("Weak or Missing Source Evidence");
  expect(wrapper.text()).toContain("AI fallback not needed");
});

it("filters likely local matches and applies only the visible suggestions", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
      <diagnosis>
        <codeValue>F84.1</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput:
        "Health_Care_Diagnosis_Code_1,Health_Care_Diagnosis_Code_2\nF84.0,F84.1",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  expect(wrapper.findAll('[data-testid="wizard-suggested-card"]').length).toBe(2);

  await wrapper.get('[data-testid="wizard-suggested-search"]').setValue("Code_2");

  expect(wrapper.findAll('[data-testid="wizard-suggested-card"]').length).toBe(1);
  expect(wrapper.text()).toContain("Health_Care_Diagnosis_Code_2");
  expect(wrapper.text()).not.toContain("Health_Care_Diagnosis_Code_1");

  await wrapper.get('[data-testid="wizard-apply-likely-button"]').trigger("click");
  await flushPromises();

  expect(pipeline.mapping.fields).toContainEqual({
    from: "claim.diagnoses.diagnosis[2].codeValue",
    to: "Health_Care_Diagnosis_Code_2",
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
  expect(
    pipeline.mapping.fields.some(
      (mapping) => mapping.to === "Health_Care_Diagnosis_Code_1",
    ),
  ).toBe(false);
});

it("shows an empty state when the likely-match search returns no results", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput: "Health_Care_Diagnosis_Code_1\nF84.0",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  await wrapper.get('[data-testid="wizard-suggested-search"]').setValue("rendering provider");

  expect(wrapper.get('[data-testid="wizard-suggested-empty-state"]').text()).toContain(
    "No likely matches match the current search.",
  );
});

it("reviews a single suggested target without auto-applying the mapping", async () => {
  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
      <diagnosis>
        <codeValue>F84.1</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput:
        "Health_Care_Diagnosis_Code_1,Health_Care_Diagnosis_Code_2\nF84.0,F84.1",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  await wrapper
    .find('[data-testid="wizard-ask-ai-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_2"]')
    .trigger("click");
  await flushPromises();

  expect(reviewSuggestedMatchSpy).toHaveBeenCalledWith({
    targetPath: "Health_Care_Diagnosis_Code_2",
    candidateSource: "claim.diagnoses.diagnosis[2].codeValue",
    sourceSamplePreview: "F84.1",
    targetSamplePreview: "F84.1",
  });
  expect(
    pipeline.mapping.fields.some(
      (mapping) => mapping.to === "Health_Care_Diagnosis_Code_2",
    ),
  ).toBe(false);
  expect(
    wrapper.get('[data-testid="wizard-suggested-review"][data-target-path="Health_Care_Diagnosis_Code_2"]').attributes("data-approved"),
  ).toBe("true");
  expect(wrapper.text()).toContain("Approved Health_Care_Diagnosis_Code_2");
  expect(
    wrapper
      .find('[data-testid="wizard-apply-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_2"]')
      .text(),
  ).toContain("Apply vetted match");

  await wrapper
    .find('[data-testid="wizard-apply-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_2"]')
    .trigger("click");
  await flushPromises();

  expect(pipeline.mapping.fields).toContainEqual({
    from: "claim.diagnoses.diagnosis[2].codeValue",
    to: "Health_Care_Diagnosis_Code_2",
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
});

it("shows a rejected review and keeps the match manual until applied anyway", async () => {
  reviewSuggestedMatchImpl.mockImplementation(async ({ options }) => ({
    approved: false,
    confidence: "medium",
    summary: `Rejected ${options.targetPath}`,
    rationale: "The target semantics do not line up cleanly with the displayed candidate.",
  }));

  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput: "Health_Care_Diagnosis_Code_1\nF84.0",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  await wrapper
    .find('[data-testid="wizard-ask-ai-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_1"]')
    .trigger("click");
  await flushPromises();

  expect(
    wrapper.get('[data-testid="wizard-suggested-review"][data-target-path="Health_Care_Diagnosis_Code_1"]').attributes("data-approved"),
  ).toBe("false");
  expect(wrapper.text()).toContain("Rejected Health_Care_Diagnosis_Code_1");
  expect(wrapper.text()).toContain("The target semantics do not line up cleanly");
  expect(
    wrapper
      .find('[data-testid="wizard-apply-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_1"]')
      .text(),
  ).toContain("Apply anyway");
  expect(pipeline.mapping.fields).toEqual([]);

  await wrapper
    .find('[data-testid="wizard-apply-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_1"]')
    .trigger("click");
  await flushPromises();

  expect(pipeline.mapping.fields).toContainEqual({
    from: "claim.diagnoses.diagnosis[1].codeValue",
    to: "Health_Care_Diagnosis_Code_1",
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
});

it("disables per-target AI buttons while a scoped AI review is already in progress", async () => {
  let releaseReview: (() => void) | undefined;
  reviewSuggestedMatchImpl.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releaseReview = () => resolve();
      }),
  );

  const pipeline = blankPipeline();

  const wrapper = mount(NewPipelineWizard, {
    props: {
      pipeline,
      samplePayload: `<envelope>
  <claim>
    <diagnoses>
      <diagnosis>
        <codeValue>F84.0</codeValue>
      </diagnosis>
      <diagnosis>
        <codeValue>F84.1</codeValue>
      </diagnosis>
    </diagnoses>
  </claim>
</envelope>`,
      sampleOutput:
        "Health_Care_Diagnosis_Code_1,Health_Care_Diagnosis_Code_2\nF84.0,F84.1",
      "onUpdate:pipeline": () => undefined,
      "onUpdate:samplePayload": () => undefined,
      "onUpdate:sampleOutput": () => undefined,
    },
    global: {
      stubs: {
        SamplePayloadEditor: SamplePayloadEditorStub,
        PipelineAiAssistant: PipelineAiAssistantStub,
      },
    },
  });

  await wrapper.get('[data-testid="wizard-name-input"]').setValue(
    "Claims intake to CSV",
  );
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const sourceSelects = wrapper.findAll("select");
  await sourceSelects[0].setValue("http");
  await sourceSelects[1].setValue("xml");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");

  const targetSelects = wrapper.findAll("select");
  await targetSelects[0].setValue("stdout");
  await targetSelects[1].setValue("csv");
  await wrapper.get('[data-testid="wizard-next-button"]').trigger("click");
  await flushPromises();

  await wrapper
    .find('[data-testid="wizard-ask-ai-suggested-button"][data-target-path="Health_Care_Diagnosis_Code_1"]')
    .trigger("click");
  await wrapper.vm.$nextTick();

  expect(
    wrapper
      .findAll('[data-testid="wizard-ask-ai-suggested-button"]')
      .every((button) => button.attributes("disabled") !== undefined),
  ).toBe(true);

  releaseReview?.();
  await flushPromises();
});
