import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import MappingTable from "./MappingTable.vue";

it("adds a mapping row with expression support", async () => {
  const wrapper = mount(MappingTable, {
    props: {
      modelValue: [],
      sourceFormat: "csv",
      samplePayload: "first_name,last_name\nAda,Lovelace\n",
      targetSchema: {
        type: "object",
        fields: [
          {
            name: "customer",
            type: "object",
            fields: [{ name: "name", type: "string" }],
          },
        ],
      },
      "onUpdate:modelValue": (value: unknown) => value,
    },
  });

  await wrapper.get("button.button-primary").trigger("click");
  const inputs = wrapper.findAll("input");
  await inputs[2].setValue("record.first_name + ' ' + record.last_name");

  expect(wrapper.html()).toContain("optional CEL expression");
  expect(wrapper.text()).toContain("CEL OK");
});

it("creates mappings from ai suggestions for matching csv columns", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref([]);
      const schema = {
        type: "object",
        fields: [
          {
            name: "customer",
            type: "object",
            fields: [
              { name: "customer_id", type: "string" },
              { name: "full_name", type: "string" },
            ],
          },
        ],
      };

      return { rows, schema };
    },
    template: `
      <MappingTable
        v-model="rows"
        source-format="csv"
        sample-payload="customer_id,full_name\n1001,Ada Lovelace\n"
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  const aiButton = wrapper
    .findAll("button")
    .find((button) => button.text().includes("AI suggest mappings"));

  await aiButton?.trigger("click");
  await wrapper.vm.$nextTick();

  expect(
    (wrapper.vm as unknown as { rows: { from: string; to: string }[] }).rows,
  ).toEqual([
    {
      from: "customer_id",
      to: "customer.customer_id",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
    {
      from: "full_name",
      to: "customer.full_name",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
  ]);
});

it("creates mappings from ai suggestions for nested json source paths", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref([]);
      const schema = {
        type: "object",
        fields: [
          { name: "customer_id", type: "string" },
          { name: "customer_name", type: "string" },
        ],
      };

      return { rows, schema };
    },
    template: `
      <MappingTable
        v-model="rows"
        source-format="json"
        sample-payload='{"customer":{"id":"1001","name":"Ada Lovelace"}}'
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  const aiButton = wrapper
    .findAll("button")
    .find((button) => button.text().includes("AI suggest mappings"));

  await aiButton?.trigger("click");
  await wrapper.vm.$nextTick();

  expect(
    (wrapper.vm as unknown as { rows: { from: string; to: string }[] }).rows,
  ).toEqual([
    {
      from: "customer.id",
      to: "customer_id",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
    {
      from: "customer.name",
      to: "customer_name",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
  ]);
});
