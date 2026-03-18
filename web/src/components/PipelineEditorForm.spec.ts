import { fireEvent, render, screen } from "@testing-library/vue";

import PipelineEditorForm from "./PipelineEditorForm.vue";
import type { PipelineDefinition } from "@/types/pipeline";

// The editor form test verifies that high-level pipeline metadata remains editable.
it("edits pipeline metadata", async () => {
  const pipeline: PipelineDefinition = {
    id: "demo",
    name: "Demo",
    description: "",
    source: { type: "http", format: "json", config: {} },
    target: { type: "stdout", format: "json", config: {} },
    mapping: { fields: [{ from: "", to: "", transforms: [] }] },
    sampleInput: "{}",
    targetSchema: { name: "schema", fields: [] },
  };

  render(PipelineEditorForm, {
    props: {
      modelValue: pipeline,
      "onUpdate:modelValue": (value: PipelineDefinition) =>
        Object.assign(pipeline, value),
    },
  });

  await fireEvent.update(screen.getByDisplayValue("Demo"), "Updated demo");
  expect(pipeline.name).toBe("Updated demo");
});
