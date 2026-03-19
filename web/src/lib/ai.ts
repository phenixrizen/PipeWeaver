import type {
  FieldMapping,
  PipelineDefinition,
  SchemaDefinition,
} from "../types/pipeline";
import { inferSourceFields, isTabularFormat } from "./schema";

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
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    label: "Llama 3.1 8B",
    note: "Primary local reasoning model for schema and mapping drafts.",
  },
  {
    id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    label: "Hermes 2 Pro Llama 3 8B",
    note: "Best alternate for stronger instruction following and mapping polish.",
  },
  {
    id: "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
    label: "NeuralHermes 2.5 Mistral 7B",
    note: "Lighter secondary option when 8B startup cost is too high.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 Mini",
    note: "Most efficient option when you need smaller local memory use.",
  },
] as const;

export const aiModeLabels: Record<AiDraftMode, string> = {
  studio: "Draft schema + mappings",
  schema: "Draft target schema",
  mapping: "Draft field mappings",
  description: "Polish description",
  explain: "Explain current pipeline",
};

export const isStructuredAiMode = (mode: AiDraftMode) => mode !== "explain";

const structuredResponseRules = `Return valid JSON with this shape:
{
  "summary": string,
  "pipelineDescription": string | undefined,
  "targetSchema": SchemaDefinition | undefined,
  "mappingFields": FieldMapping[] | undefined
}
Only include the sections relevant to the requested task.
Return exactly one JSON object.
The first character must be { and the last character must be }.
Do not include markdown fences or any commentary outside the JSON object.`;

const explainResponseRules = `Return operator-facing markdown, not JSON.
Use short sections with practical headings such as:
- What this pipeline does
- Risks or gaps
- Review next
Do not include markdown fences.`;

const describeTargetShape = (pipeline: PipelineDefinition) => {
  const targetFormat = pipeline.target.format;

  if (isTabularFormat(targetFormat)) {
    return `Target format: ${targetFormat}
- targetSchema.fields must be a flat ordered column list.
- Every targetSchema field must be a leaf field, not a nested object.
- mappingFields[].to must be flat output column names.
- Do not invent nested customer/invoice objects for tabular outputs unless the column names themselves intentionally contain dots.`;
  }

  if (targetFormat === "xml") {
    return `Target format: xml
- targetSchema should describe a nested XML element tree.
- Include targetSchema.name with the XML record element name when you can infer it.
- mappingFields[].to should target leaf element paths.
- Keep the structure practical for flat record-by-record XML output.`;
  }

  return `Target format: json
- targetSchema should describe the JSON output object tree.
- Nested objects are appropriate when they make the output clearer.
- mappingFields[].to should target leaf JSON paths.`;
};

const describeSourceShape = (pipeline: PipelineDefinition, samplePayload: string) => {
  const sourceFields = inferSourceFields(pipeline.source.format, samplePayload);

  if (!sourceFields.length) {
    return `Source format: ${pipeline.source.format}
- No inferred source fields were available from the sample payload.
- Use the sample payload directly and keep assumptions explicit.`;
  }

  return `Source format: ${pipeline.source.format}
- Use these inferred source field paths when drafting mappings:
${sourceFields.map((field) => `  - ${field.path} (${field.type})`).join("\n")}
- Prefer direct source field paths over CEL expressions unless the mapping truly needs composition or logic.`;
};

const buildModeInstruction = (
  mode: AiDraftMode,
  pipeline: PipelineDefinition,
  sampleOutput?: string,
): string => {
  const targetShape = describeTargetShape(pipeline);
  const schemaLockedBySampleOutput = Boolean(sampleOutput?.trim());

  switch (mode) {
    case "studio":
      return schemaLockedBySampleOutput
        ? `Generate a concise summary, an improved pipelineDescription, and mappingFields.
${targetShape}
The current pipeline.targetSchema was inferred from a target sample output and is authoritative.
Do not invent or replace the targetSchema unless it is missing.`
        : `Generate a concise summary, an improved pipelineDescription, a targetSchema, and mappingFields.
${targetShape}
Prefer explicit required flags when obvious and simple transforms such as trim, normalize_whitespace, to_float, to_int, default, prefix, suffix, replace, substring, and coalesce.`;
    case "schema":
      return schemaLockedBySampleOutput
        ? `Generate a concise summary only.
${targetShape}
The targetSchema already comes from the target sample output, so focus on validating that shape in your summary and do not emit a replacement schema.`
        : `Generate a concise summary and a targetSchema only.
${targetShape}
Do not include mappingFields unless they are essential to explain the schema.`;
    case "mapping":
      return `Generate a concise summary and mappingFields only.
${targetShape}
Prefer direct source field paths when available and only use CEL expressions when needed.`;
    case "description":
      return "Generate a concise summary and an improved pipelineDescription only.";
    case "explain":
    default:
      return "Explain the current pipeline in operator-facing markdown. Cover what the pipeline does, likely risks, and what the operator should review next.";
  }
};

export const buildAiPrompt = (options: {
  mode: AiDraftMode;
  pipeline: PipelineDefinition;
  samplePayload: string;
  sampleOutput?: string;
  authorPrompt: string;
}) => {
  const { mode, pipeline, samplePayload, sampleOutput, authorPrompt } = options;

  return [
    `Task: ${aiModeLabels[mode]}`,
    buildModeInstruction(mode, pipeline, sampleOutput),
    describeSourceShape(pipeline, samplePayload),
    isStructuredAiMode(mode) ? structuredResponseRules : explainResponseRules,
    "Current pipeline JSON:",
    JSON.stringify(pipeline, null, 2),
    "Sample payload:",
    samplePayload,
    ...(sampleOutput?.trim()
      ? ["Target sample output:", sampleOutput]
      : []),
    "Operator instructions:",
    authorPrompt ||
      "Use the sample payload to infer realistic output fields and keep the result production-friendly.",
  ].join("\n\n");
};

export const defaultAiInstruction = (
  mode: AiDraftMode,
  pipeline?: PipelineDefinition,
) => {
  const targetFormat = pipeline?.target.format ?? "json";

  switch (mode) {
    case "schema":
      return isTabularFormat(targetFormat)
        ? "Design a clean flat output column schema for the sample payload."
        : targetFormat === "xml"
          ? "Design a clean XML target tree for the sample payload and include a sensible XML record element name."
          : "Design a clean JSON target schema for the sample payload. Use nested objects when they improve clarity.";
    case "mapping":
      return "Map incoming fields into the target schema using direct source paths where possible and minimal transforms.";
    case "description":
      return "Rewrite the description to be crisp, operator-friendly, and clear about the business outcome.";
    case "explain":
      return "Explain the current pipeline in plain language and call out any assumptions or missing details.";
    case "studio":
    default:
      return isTabularFormat(targetFormat)
        ? "Generate a strong first draft of the output columns, field mappings, and description based on the current sample payload."
        : targetFormat === "xml"
          ? "Generate a strong first draft of the XML target tree, field mappings, and description based on the current sample payload."
          : "Generate a strong first draft of the target schema, field mappings, and description based on the current sample payload.";
  }
};

export const extractFirstJsonObject = (raw: string) => {
  const start = raw.indexOf("{");
  if (start === -1) {
    return raw;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return raw;
};

export const normalizeStructuredAiResponseText = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const firstObject = extractFirstJsonObject(trimmed);
  try {
    return JSON.stringify(JSON.parse(firstObject), null, 2);
  } catch {
    return firstObject;
  }
};

export const parseAiResponse = (raw: string): AiDraftResponse => {
  const normalized = raw.trim();
  const parsed = JSON.parse(extractFirstJsonObject(normalized)) as AiDraftResponse;

  if (!parsed || typeof parsed.summary !== "string") {
    throw new Error("The AI response did not include a valid summary.");
  }

  return parsed;
};
