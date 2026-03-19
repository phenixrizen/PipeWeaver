import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import SchemaEditor from "./SchemaEditor.vue";
import type { FieldMapping, SchemaDefinition } from "../types/pipeline";

it("creates a tabular target column and mapping from a dragged source field", async () => {
  const Harness = defineComponent({
    components: { SchemaEditor },
    setup() {
      const schema = ref<SchemaDefinition>();
      const mappings = ref<FieldMapping[]>([]);
      return { schema, mappings };
    },
    template: `
      <SchemaEditor
        v-model="schema"
        v-model:mappings="mappings"
        source-format="csv"
        target-format="csv"
        sample-payload="customer_id,full_name\n1001,Ada Lovelace\n"
      />
    `,
  });

  const wrapper = mount(Harness);

  const sourceButton = wrapper
    .findAll('[data-testid="source-field-chip"]')
    .find((button) => button.text().includes("customer_id"));
  const addZone = wrapper.get('[data-testid="schema-root-drop-zone"]');

  expect(sourceButton).toBeTruthy();

  await sourceButton!.trigger("dragstart");
  await addZone.trigger("drop");
  await wrapper.vm.$nextTick();

  const vm = wrapper.vm as unknown as {
    schema?: SchemaDefinition;
    mappings: FieldMapping[];
  };

  expect(vm.schema?.fields[0]).toMatchObject({
    name: "customer_id",
    column: "customer_id",
  });
  expect(vm.mappings).toEqual([
    {
      from: "customer_id",
      to: "customer_id",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
  ]);
});

it("creates a nested target leaf and mapping from a dragged source field", async () => {
  const Harness = defineComponent({
    components: { SchemaEditor },
    setup() {
      const schema = ref<SchemaDefinition>();
      const mappings = ref<FieldMapping[]>([]);
      return { schema, mappings };
    },
    template: `
      <SchemaEditor
        v-model="schema"
        v-model:mappings="mappings"
        source-format="xml"
        target-format="json"
        sample-payload="<order><customer><account><id>1001</id></account></customer></order>"
      />
    `,
  });

  const wrapper = mount(Harness);

  const sourceButton = wrapper
    .findAll('[data-testid="source-field-chip"]')
    .find((button) => button.text().includes("customer.account.id"));
  const rootZone = wrapper.get('[data-testid="schema-root-drop-zone"]');

  expect(sourceButton).toBeTruthy();

  await sourceButton!.trigger("dragstart");
  await rootZone.trigger("drop");
  await wrapper.vm.$nextTick();

  const vm = wrapper.vm as unknown as {
    schema?: SchemaDefinition;
    mappings: FieldMapping[];
  };

  expect(vm.schema?.fields[0]).toMatchObject({
    name: "id",
    type: "integer",
  });
  expect(vm.mappings).toEqual([
    {
      from: "customer.account.id",
      to: "id",
      required: false,
      expression: "",
      transforms: [{ type: "trim" }],
    },
  ]);
});

it("reorders root target nodes with drag and drop", async () => {
  const Harness = defineComponent({
    components: { SchemaEditor },
    setup() {
      const schema = ref<SchemaDefinition>({
        type: "object",
        fields: [
          { name: "customer", type: "object", fields: [] },
          { name: "invoice", type: "object", fields: [] },
        ],
      });
      const mappings = ref<FieldMapping[]>([]);
      return { schema, mappings };
    },
    template: `
      <SchemaEditor
        v-model="schema"
        v-model:mappings="mappings"
        source-format="json"
        target-format="json"
        sample-payload='{"customer":{"id":"1001"}}'
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper
    .get('[data-testid="schema-node-drag-handle"][data-target-path="invoice"]')
    .trigger("dragstart");
  await wrapper
    .get('[data-testid="schema-drop-before"][data-target-path="customer"]')
    .trigger("drop");
  await wrapper.vm.$nextTick();

  const vm = wrapper.vm as unknown as { schema?: SchemaDefinition };
  expect(vm.schema?.fields.map((field) => field.name)).toEqual([
    "invoice",
    "customer",
  ]);
});

it("reparents a nested target node and rewrites mapping targets", async () => {
  const Harness = defineComponent({
    components: { SchemaEditor },
    setup() {
      const schema = ref<SchemaDefinition>({
        type: "object",
        fields: [
          { name: "customer", type: "object", fields: [] },
          {
            name: "invoice",
            type: "object",
            fields: [{ name: "amount", type: "number" }],
          },
        ],
      });
      const mappings = ref<FieldMapping[]>([
        {
          from: "amount",
          to: "invoice.amount",
          required: false,
          expression: "",
          transforms: [{ type: "trim" }],
        },
      ]);
      return { schema, mappings };
    },
    template: `
      <SchemaEditor
        v-model="schema"
        v-model:mappings="mappings"
        source-format="json"
        target-format="json"
        sample-payload='{"amount":"12.50"}'
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper
    .get('[data-testid="schema-node-drag-handle"][data-target-path="invoice.amount"]')
    .trigger("dragstart");
  await wrapper
    .get('[data-testid="schema-drop-inside"][data-target-path="customer"]')
    .trigger("drop");
  await wrapper.vm.$nextTick();

  const vm = wrapper.vm as unknown as {
    schema?: SchemaDefinition;
    mappings: FieldMapping[];
  };

  expect(vm.schema?.fields[0]?.fields?.map((field) => field.name)).toEqual([
    "amount",
  ]);
  expect(vm.mappings[0]?.to).toBe("customer.amount");
});
