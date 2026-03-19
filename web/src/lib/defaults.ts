import type { PipelineDefinition } from "../types/pipeline";

export const blankPipeline = (): PipelineDefinition => ({
  pipeline: {
    id: "",
    name: "",
    description: "",
  },
  source: {
    type: "",
    format: "",
    config: {},
  },
  target: {
    type: "",
    format: "",
    config: {},
  },
  mapping: {
    fields: [],
  },
  targetSchema: undefined,
});

export const blankSamplePayload = "";
export const blankSampleOutput = "";

// defaultPipeline provides a ready-to-edit configuration that mirrors the backend example workflow.
export const defaultPipeline = (): PipelineDefinition => ({
  pipeline: {
    id: "draft-pipeline",
    name: "Draft pipeline",
    description: "A backend-first mapping workflow built with PipeWeaver.",
  },
  source: {
    type: "http",
    format: "csv",
    config: {
      samplePayload: "customer_id,full_name,amount\n1001, Ada Lovelace ,12.50",
    },
  },
  target: {
    type: "stdout",
    format: "json",
    config: {},
  },
  mapping: {
    fields: [
      {
        from: "customer_id",
        to: "customer.id",
        transforms: [{ type: "trim" }],
      },
      {
        from: "full_name",
        to: "customer.name",
        transforms: [{ type: "trim" }],
      },
      {
        expression: 'customer_id + ":" + full_name',
        to: "customer.display",
        transforms: [{ type: "trim" }],
      },
      {
        from: "amount",
        to: "invoice.amount",
        transforms: [{ type: "to_float" }],
      },
      {
        to: "invoice.currency",
        transforms: [{ type: "default", value: "USD" }],
      },
    ],
  },
  targetSchema: {
    type: "object",
    fields: [
      {
        name: "customer",
        type: "object",
        required: true,
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string", required: true },
          { name: "display", type: "string", required: true },
        ],
      },
      {
        name: "invoice",
        type: "object",
        required: true,
        fields: [
          { name: "amount", type: "number", required: true },
          { name: "currency", type: "string", required: true },
        ],
      },
    ],
  },
});

export const defaultSamplePayload =
  "customer_id,full_name,amount\n1001, Ada Lovelace ,12.50\n1002,Grace Hopper,41.75";
