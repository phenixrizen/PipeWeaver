import type {
  FieldMapping,
  PipelineDefinition,
  SchemaDefinition,
} from "../types/pipeline";

export type AiDraftMode =
  | "studio"
  | "schema"
  | "mapping"
  | "description"
  | "explain";

export interface AiDraftResponse {
  summary: string;
  pipelineDescription?: string;
  targetSchema?: SchemaDefinition;
  mappingFields?: FieldMapping[];
}

export const aiModelOptions = [
  {
    id: "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 Coder 0.5B",
    note: "Fastest startup, best for lightweight local drafts.",
  },
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder 1.5B",
    note: "Balanced quality and download size for mapping generation.",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B",
    note: "General-purpose fallback for schema and description drafting.",
  },
] as const;

export const aiModeLabels: Record<AiDraftMode, string> = {
  studio: "Draft schema + mappings",
  schema: "Draft target schema",
  mapping: "Draft field mappings",
  description: "Polish description",
  explain: "Explain current pipeline",
};

const modeInstructions: Record<AiDraftMode, string> = {
  studio:
    "Generate a concise summary, an improved pipelineDescription, a targetSchema, and mappingFields. Favor explicit nested objects, required flags when obvious, and simple transforms such as trim, to_float, to_int, default, and lower.",
  schema:
    "Generate a concise summary and a targetSchema only. Do not include mappingFields unless they are essential to explain the schema.",
  mapping:
    "Generate a concise summary and mappingFields only. Prefer source field paths when available and only use CEL expressions when needed.",
  description:
    "Generate a concise summary and an improved pipelineDescription only.",
  explain:
    "Generate a concise summary only. Explain what the pipeline does, likely risks, and what the operator should review next.",
};

const responseRules = `Return valid JSON with this shape:
{
  "summary": string,
  "pipelineDescription": string | undefined,
  "targetSchema": SchemaDefinition | undefined,
  "mappingFields": FieldMapping[] | undefined
}
Only include the sections relevant to the requested task. No markdown fences.`;

export const buildAiPrompt = (options: {
  mode: AiDraftMode;
  pipeline: PipelineDefinition;
  samplePayload: string;
  authorPrompt: string;
}) => {
  const { mode, pipeline, samplePayload, authorPrompt } = options;

  return [
    `Task: ${aiModeLabels[mode]}`,
    modeInstructions[mode],
    responseRules,
    "Current pipeline JSON:",
    JSON.stringify(pipeline, null, 2),
    "Sample payload:",
    samplePayload,
    "Operator instructions:",
    authorPrompt ||
      "Use the sample payload to infer realistic output fields and keep the result production-friendly.",
  ].join("\n\n");
};

export const defaultAiInstruction = (mode: AiDraftMode) => {
  switch (mode) {
    case "schema":
      return "Design a clean target schema for the sample payload. Use nested objects when it improves clarity.";
    case "mapping":
      return "Map incoming fields into the target schema using direct source fields where possible and minimal transforms.";
    case "description":
      return "Rewrite the description to be crisp, operator-friendly, and clear about the business outcome.";
    case "explain":
      return "Explain the current pipeline in plain language and call out any assumptions or missing details.";
    case "studio":
    default:
      return "Generate a strong first draft of the target schema, field mappings, and description based on the current sample payload.";
  }
};

export const parseAiResponse = (raw: string): AiDraftResponse => {
  const parsed = JSON.parse(raw) as AiDraftResponse;

  if (!parsed || typeof parsed.summary !== "string") {
    throw new Error("The AI response did not include a valid summary.");
  }

  return parsed;
};
