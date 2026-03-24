import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, vi } from "vitest";
import MappingTable from "./MappingTable.vue";

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

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
  await wrapper
    .get(
      'input[placeholder*="optional CEL expression"], input[placeholder*="record.first_name"]',
    )
    .setValue("record.first_name + ' ' + record.last_name");

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

it("filters large field lists and maps a selected source by clicking a target row", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref([]);
      const schema = {
        type: "object",
        fields: [
          { name: "claim_type", type: "string" },
          { name: "claim_status_code", type: "string" },
        ],
      };

      return { rows, schema };
    },
    template: `
      <MappingTable
        v-model="rows"
        source-format="json"
        sample-payload='{"claim":{"type":"professional","statusCode":"paid"}}'
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper
    .get('[data-testid="field-browser-source-search"]')
    .setValue("claim.type");
  await wrapper
    .get('[data-testid="field-browser-target-search"]')
    .setValue("claim_type");

  await wrapper
    .get('[data-testid="source-field-chip"][data-source-path="claim.type"]')
    .trigger("click");
  await wrapper
    .get('[data-testid="field-browser-target-row"][data-target-path="claim_type"]')
    .trigger("click");
  await wrapper.vm.$nextTick();

  expect(
    (wrapper.vm as unknown as { rows: { from: string; to: string }[] }).rows,
  ).toContainEqual({
    from: "claim.type",
    to: "claim_type",
    required: false,
    expression: "",
    transforms: [{ type: "trim" }],
  });
});

it("opens a target detail card when the user clicks an output target without a selected source", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref<
        { from?: string; expression?: string; to: string; transforms: { type: string }[] }[]
      >([]);
      const schema = {
        type: "object",
        fields: [{ name: "claim_type", type: "string" }],
      };

      return { rows, schema };
    },
    template: `
      <MappingTable
        v-model="rows"
        source-format="json"
        sample-payload='{"claim":{"type":"professional"}}'
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper
    .get('[data-testid="field-browser-target-row"][data-target-path="claim_type"]')
    .trigger("click");
  await wrapper.vm.$nextTick();

  expect(
    (wrapper.vm as unknown as { rows: { to: string }[] }).rows,
  ).toContainEqual({
    from: "",
    to: "claim_type",
    required: false,
    expression: "",
    transforms: [],
  });
});

it("lets the user set a repeated XML branch as the active row driver", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref([
        {
          from: "Body.Claim.Referral.Services.Service.ProcedureCode",
          to: "Procedure_Code",
          required: false,
          expression: "",
          transforms: [{ type: "trim" }],
        },
      ]);
      const schema = {
        type: "object",
        fields: [{ name: "Procedure_Code", type: "string" }],
      };
      const rowDriverPath = ref<string | undefined>();

      return { rows, schema, rowDriverPath };
    },
    template: `
      <MappingTable
        v-model="rows"
        v-model:row-driver-path="rowDriverPath"
        source-format="xml"
        sample-payload='<Envelope><Body><Claim><Referral><Services><Service><ProcedureCode>97153</ProcedureCode></Service><Service><ProcedureCode>97155</ProcedureCode></Service></Services></Referral></Claim></Body></Envelope>'
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper.get('[data-testid="mapping-row-driver-button"]').trigger("click");

  expect(
    (wrapper.vm as unknown as { rowDriverPath?: string }).rowDriverPath,
  ).toBe("Body.Claim.Referral.Services.Service");
});

it("moves expression-mapped targets from unmatched search results to mapped results immediately", async () => {
  const Harness = defineComponent({
    components: { MappingTable },
    setup() {
      const rows = ref<
        { from?: string; expression?: string; to: string; transforms: { type: string }[] }[]
      >([]);
      const schema = {
        type: "object",
        fields: [{ name: "claim_type", type: "string" }],
      };

      return { rows, schema };
    },
    template: `
      <MappingTable
        v-model="rows"
        source-format="json"
        sample-payload='{"claim":{"type":"professional"}}'
        :target-schema="schema"
      />
    `,
  });

  const wrapper = mount(Harness);

  await wrapper
    .get('[data-testid="field-browser-target-search"]')
    .setValue("claim_type");
  await wrapper
    .get('[data-testid="field-browser-target-row"][data-target-path="claim_type"]')
    .trigger("click");
  await wrapper
    .get(
      'input[placeholder*="optional CEL expression"], input[placeholder*="record.first_name"]',
    )
    .setValue("record.claim.type");
  await wrapper.vm.$nextTick();

  expect(wrapper.get('[data-testid="field-browser-filter-unmatched"]').text()).toContain(
    "0",
  );
  expect(wrapper.findAll('[data-testid="field-browser-target-row"]')).toHaveLength(0);

  await wrapper.get('[data-testid="field-browser-filter-mapped"]').trigger("click");

  expect(wrapper.get('[data-testid="field-browser-filter-mapped"]').text()).toContain(
    "1",
  );
  expect(wrapper.findAll('[data-testid="field-browser-target-row"]')).toHaveLength(1);
});
