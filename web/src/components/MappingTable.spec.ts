import { fireEvent, render, screen } from "@testing-library/vue";

import type { FieldMapping } from "@/types/pipeline";

import MappingTable from "./MappingTable.vue";

// The mapping table test covers adding and removing rows, which are core editor actions.
it("adds and removes mapping rows", async () => {
  const modelValue: FieldMapping[] = [
    { from: "name", to: "customer.name", required: false, transforms: [] },
  ];
  render(MappingTable, {
    props: {
      modelValue,
      "onUpdate:modelValue": (value: FieldMapping[]) => {
        modelValue.splice(0, modelValue.length, ...value);
      },
    },
  });

  await fireEvent.click(screen.getByText("Add row"));
  expect(modelValue).toHaveLength(2);

  await fireEvent.click(screen.getAllByText("Remove row")[0]);
  expect(modelValue).toHaveLength(1);
});
