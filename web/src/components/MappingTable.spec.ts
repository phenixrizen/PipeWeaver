import { mount } from "@vue/test-utils";
import MappingTable from "./MappingTable.vue";

// The component test focuses on row creation and browser-side CEL validation because both are primary v1 mapping interactions.
it("adds a mapping row with expression support", async () => {
  const wrapper = mount(MappingTable, {
    props: {
      modelValue: [],
      sourceFormat: "csv",
      samplePayload: "first_name,last_name\nAda,Lovelace\n",
      "onUpdate:modelValue": (value: unknown) => value,
    },
  });

  await wrapper.get("button").trigger("click");
  const inputs = wrapper.findAll("input");
  await inputs[2].setValue("record.first_name + ' ' + record.last_name");

  expect(wrapper.html()).toContain("optional CEL expression");
  expect(wrapper.text()).toContain("CEL OK");
});
