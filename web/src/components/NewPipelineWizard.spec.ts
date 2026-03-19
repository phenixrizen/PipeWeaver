import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { expect, it } from "vitest";
import NewPipelineWizard from "./NewPipelineWizard.vue";
import { blankPipeline } from "../lib/defaults";

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

const PipelineAiAssistantStub = defineComponent({
  template: '<div data-testid="wizard-ai-stub" />',
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
  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");

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

it("infers explode repeat mode when the target sample fans repeated xml values into rows", async () => {
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
  await wrapper.get('[data-testid="wizard-complete-button"]').trigger("click");

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
      repeatMode: "explode",
      transforms: [],
    },
  ]);
});
