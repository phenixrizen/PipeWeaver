import { flushPromises, mount } from "@vue/test-utils";
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

it("opens the generate step immediately and shows matching status while local preparation runs", async () => {
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

  expect(pipeline.targetSchema?.fields.map((field) => field.name)).toEqual([
    "customer_name",
  ]);
  expect(wrapper.text()).toContain("Generate from samples");
  expect(wrapper.text()).toContain("Preparing local draft");
  expect(wrapper.text()).toContain("Matching status");
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
