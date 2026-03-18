import { mount } from "@vue/test-utils";
import MappingTable from "./MappingTable.vue";

// The component test focuses on row creation and CEL expression editing because both are primary v1 mapping interactions.
it("adds a mapping row with expression support", async () => {
  const wrapper = mount(MappingTable, {
    props: {
      modelValue: [],
      "onUpdate:modelValue": (value: unknown) => value,
    },
  });

  await wrapper.get("button").trigger("click");
  const inputs = wrapper.findAll("input");
  await inputs[2].setValue("record.first_name + ' ' + record.last_name");

  expect(wrapper.html()).toContain("optional CEL expression");
  expect(wrapper.html()).toContain("record.first_name");
});
