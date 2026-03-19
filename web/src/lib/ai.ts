import type {
  FieldMapping,
  PipelineDefinition,
  SchemaDefinition,
} from "../types/pipeline";
import {
  flattenSchemaLeafOptions,
  inferSourceFields,
  isTabularFormat,
  rankTargetMatches,
  type TargetMatchResolution,
} from "./schema";

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

export interface AiModelOption {
  id: string;
  label: string;
  sizeLabel: string;
  vramRequiredMB: number;
  vramLabel: string;
  dropdownLabel: string;
  note: string;
  contextWindowSize: number;
}

export interface AiPromptBuildResult {
  prompt: string;
  promptMode: "full" | "compact" | "unfit";
  estimatedPromptTokens: number;
  effectiveMaxTokens: number;
  statusNote: string;
  shouldMergeMappings: boolean;
  lockedMappingTargets: string[];
  batches: AiPromptBatch[];
}

export interface AiPromptBatch {
  prompt: string;
  estimatedPromptTokens: number;
  effectiveMaxTokens: number;
  batchIndex: number;
  totalBatches: number;
  unresolvedTargetCount: number;
}

export const aiModelOptions = [
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    label: "Llama 3.1",
    sizeLabel: "8B",
    vramRequiredMB: 5001,
    vramLabel: "~5.0 GB VRAM",
    dropdownLabel: "Llama 3.1 · 8B · ~5.0 GB VRAM",
    note: "Primary local reasoning model for schema and mapping drafts.",
    contextWindowSize: 4096,
  },
  {
    id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    label: "Hermes 2 Pro Llama 3",
    sizeLabel: "8B",
    vramRequiredMB: 4976.13,
    vramLabel: "~5.0 GB VRAM",
    dropdownLabel: "Hermes 2 Pro Llama 3 · 8B · ~5.0 GB VRAM",
    note: "Best alternate for stronger instruction following and mapping polish.",
    contextWindowSize: 4096,
  },
  {
    id: "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
    label: "NeuralHermes 2.5 Mistral",
    sizeLabel: "7B",
    vramRequiredMB: 4573.39,
    vramLabel: "~4.6 GB VRAM",
    dropdownLabel: "NeuralHermes 2.5 Mistral · 7B · ~4.6 GB VRAM",
    note: "Lighter secondary option when 8B startup cost is too high.",
    contextWindowSize: 4096,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5",
    sizeLabel: "Mini",
    vramRequiredMB: 3672.07,
    vramLabel: "~3.7 GB VRAM",
    dropdownLabel: "Phi 3.5 · Mini · ~3.7 GB VRAM",
    note: "Most efficient option when you need smaller local memory use.",
    contextWindowSize: 4096,
  },
] as const satisfies readonly AiModelOption[];

export const aiModeLabels: Record<AiDraftMode, string> = {
  studio: "Draft schema + mappings",
  schema: "Draft target schema",
  mapping: "Draft field mappings",
  description: "Polish description",
  explain: "Explain current pipeline",
};

export const isStructuredAiMode = (mode: AiDraftMode) => mode !== "explain";

const nullableStringSchema = {
  type: ["string", "null"],
} as const;

const nullableBooleanSchema = {
  type: ["boolean", "null"],
} as const;

const transformJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string" },
    value: {
      type: ["string", "number", "boolean", "null"],
    },
    values: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    then: nullableStringSchema,
    else: nullableStringSchema,
  },
  required: ["type"],
  additionalProperties: false,
} as const;

const mappingFieldJsonSchema = {
  type: "object",
  properties: {
    from: nullableStringSchema,
    expression: nullableStringSchema,
    to: { type: "string" },
    required: nullableBooleanSchema,
    repeatMode: {
      type: ["string", "null"],
      enum: ["inherit", "preserve", "explode", null],
    },
    joinDelimiter: nullableStringSchema,
    transforms: {
      type: "array",
      items: transformJsonSchema,
    },
  },
  required: ["to", "transforms"],
  additionalProperties: false,
} as const;

const schemaFieldJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    type: { type: "string" },
    required: nullableBooleanSchema,
    description: nullableStringSchema,
    column: nullableStringSchema,
    index: {
      type: ["integer", "null"],
    },
    fields: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
  required: ["name", "type"],
  additionalProperties: true,
} as const;

const targetSchemaJsonSchema = {
  type: ["object", "null"],
  properties: {
    name: nullableStringSchema,
    type: { type: "string" },
    fields: {
      type: "array",
      items: schemaFieldJsonSchema,
    },
    xsdNote: nullableStringSchema,
  },
  required: ["type", "fields"],
  additionalProperties: true,
} as const;

export const structuredAiResponseSchema = JSON.stringify({
  type: "object",
  properties: {
    summary: { type: "string" },
    pipelineDescription: nullableStringSchema,
    targetSchema: targetSchemaJsonSchema,
    mappingFields: {
      type: ["array", "null"],
      items: mappingFieldJsonSchema,
    },
  },
  required: ["summary"],
  additionalProperties: false,
});

const structuredResponseRules = `Return valid JSON with this shape:
{
  "summary": string,
  "pipelineDescription": string | undefined,
  "targetSchema": SchemaDefinition | undefined,
  "mappingFields": FieldMapping[] | undefined
}
Only include the sections relevant to the requested task.
Follow the JSON schema exactly.
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

const describeCompactSourceShape = (
  pipeline: PipelineDefinition,
  samplePayload: string,
) => {
  const sourceFields = inferSourceFields(pipeline.source.format, samplePayload);

  if (!sourceFields.length) {
    return `Source format: ${pipeline.source.format}
- No inferred source fields were available from the sample payload.
- Use the provided sample excerpt directly and keep assumptions explicit.`;
  }

  const limitedFields = sourceFields.slice(0, 30);
  const truncatedCount = sourceFields.length - limitedFields.length;
  const sourcePathPrefix = sharedPathPrefix(sourceFields.map((field) => field.path));

  return `Source format: ${pipeline.source.format}
- Common source path prefix: ${sourcePathPrefix || "(none)"}
- Use these inferred source field paths when drafting mappings:
${limitedFields.map((field) => `  - ${abbreviatePath(field.path, sourcePathPrefix)} (${field.type})`).join("\n")}
${truncatedCount > 0 ? `- ${truncatedCount} additional source fields were omitted for compact mode.` : ""}
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

const minOutputTokens = 256;
const promptSafetyMarginTokens = 384;
const compactPromptCharThreshold = 8000;
const rawSampleCharThreshold = 3000;
const maxCompactExcerptChars = 900;
const maxCompactTargetsPerBatch = 32;

const estimatePromptTokens = (prompt: string) =>
  Math.max(1, Math.ceil(prompt.length / 3));

const computeEffectiveMaxTokens = (
  requestedMaxTokens: number,
  estimatedPromptTokens: number,
  contextWindowSize: number,
) =>
  Math.max(
    minOutputTokens,
    Math.min(
      requestedMaxTokens,
      contextWindowSize - estimatedPromptTokens - promptSafetyMarginTokens,
    ),
  );

const canFitPrompt = (
  estimatedPromptTokens: number,
  contextWindowSize: number,
) =>
  estimatedPromptTokens + minOutputTokens + promptSafetyMarginTokens <=
  contextWindowSize;

const truncateText = (value: string, maxChars: number) => {
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 19)).trimEnd()}\n...[truncated]`;
};

const sharedPathPrefix = (paths: string[]) => {
  const segmentedPaths = paths
    .filter((path) => path.trim().length > 0)
    .map((path) => path.split("."));
  if (!segmentedPaths.length) {
    return "";
  }

  const prefix: string[] = [];
  for (let index = 0; index < segmentedPaths[0].length; index += 1) {
    const segment = segmentedPaths[0][index];
    if (
      segmentedPaths.some((pathSegments) => pathSegments[index] !== segment)
    ) {
      break;
    }
    prefix.push(segment);
  }

  return prefix.join(".");
};

const abbreviatePath = (path: string, prefix: string) =>
  prefix && path.startsWith(`${prefix}.`)
    ? path.slice(prefix.length + 1)
    : path;

const summarizeTabularSample = (
  format: string,
  sample: string,
  rowLimit = 2,
  columnLimit = 12,
) => {
  const delimiter =
    format === "tsv" ? "\t" : format === "pipe" ? "|" : ",";
  const lines = sample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return "";
  }

  const headers = lines[0]
    .split(delimiter)
    .map((header) => header.trim())
    .filter(Boolean);
  const visibleHeaders = headers.slice(0, columnLimit);
  const omittedColumns = headers.length - visibleHeaders.length;
  const visibleRows = lines.slice(1, rowLimit + 1).map((line) => {
    const values = line.split(delimiter);
    return visibleHeaders
      .map((header, index) => `${header}=${values[index]?.trim() ?? ""}`)
      .join(" | ");
  });

  return [
    `Columns (${headers.length} total): ${visibleHeaders.join(", ")}${omittedColumns > 0 ? ` ...[${omittedColumns} more omitted]` : ""}`,
    ...visibleRows,
  ].join("\n");
};

const summarizeStructuredSample = (sample: string) =>
  truncateText(sample, maxCompactExcerptChars);

const summarizeConfigForPrompt = (config: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(config)
      .filter(([key]) => !["samplePayload", "sampleOutput"].includes(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? truncateText(value, 120) : value,
      ]),
  );

const summarizeSampleForPrompt = (format: string, sample: string) => {
  const trimmed = sample.trim();
  if (!trimmed) {
    return "";
  }

  if (isTabularFormat(format)) {
    return summarizeTabularSample(format, trimmed);
  }

  return summarizeStructuredSample(trimmed);
};

const formatAppliedMappings = (
  mappings: FieldMapping[],
  maxItems = 24,
) => {
  if (!mappings.length) {
    return "- None yet.";
  }

  return mappings
    .slice(0, maxItems)
    .map((mapping) => {
      const source = mapping.from?.trim() || mapping.expression?.trim() || "(derived)";
      return `- ${source} -> ${mapping.to}`;
    })
    .join("\n");
};

const collectUnresolvedTargetCandidates = (
  pipeline: PipelineDefinition,
  samplePayload: string,
) => {
  const sourceFields = inferSourceFields(pipeline.source.format, samplePayload);
  const targetFields = flattenSchemaLeafOptions(pipeline.targetSchema?.fields);
  const lockedTargets = new Set(
    pipeline.mapping.fields
      .map((mapping) => mapping.to)
      .filter((target): target is string => Boolean(target)),
  );

  return rankTargetMatches(sourceFields, targetFields).filter(
    (resolution) => !lockedTargets.has(resolution.target),
  );
};

const formatUnresolvedTargetCandidates = (
  resolutions: TargetMatchResolution[],
  sourcePathPrefix = "",
) => {
  if (!resolutions.length) {
    return "- No unresolved target paths remain.";
  }

  return resolutions
    .map((resolution) => {
      const candidates = resolution.candidates.length
        ? resolution.candidates
            .slice(0, 2)
            .map(
              (candidate) =>
                `${abbreviatePath(candidate.source, sourcePathPrefix)} (${candidate.type})`,
            )
            .join("; ")
        : "no strong local candidates";
      return `- ${resolution.target} [${resolution.targetType}] :: ${candidates}`;
    })
    .join("\n");
};

const buildCompactAiPrompt = (options: {
  mode: AiDraftMode;
  pipeline: PipelineDefinition;
  samplePayload: string;
  sampleOutput?: string;
  authorPrompt: string;
  unresolvedTargetCandidates?: TargetMatchResolution[];
  batchIndex?: number;
  totalBatches?: number;
}) => {
  const {
    mode,
    pipeline,
    samplePayload,
    sampleOutput,
    authorPrompt,
    unresolvedTargetCandidates = [],
    batchIndex = 1,
    totalBatches = 1,
  } = options;
  const hasLockedMappings = pipeline.mapping.fields.length > 0;
  const mappingFocusedMode = mode === "studio" || mode === "mapping";
  const sourcePathPrefix = sharedPathPrefix(
    inferSourceFields(pipeline.source.format, samplePayload).map((field) => field.path),
  );
  const batchLabel =
    totalBatches > 1
      ? `This request resolves mapping batch ${batchIndex} of ${totalBatches}. Only emit mappingFields for the unresolved targets listed in this batch.`
      : "";
  const compactInstructions = !isStructuredAiMode(mode)
    ? "Compact mode is active because the raw samples were too large for local model context. Base the explanation on the summarized structure and examples below."
    : mappingFocusedMode
      ? [
          "Compact mode is active because the raw samples were too large for local model context.",
          batchLabel,
          hasLockedMappings
            ? "Treat the existing mappings as locked. Only emit mappingFields for unresolved targets listed below."
            : "Use the candidate source suggestions for unresolved targets when emitting mappingFields.",
          "Prefer the provided candidate sources over inventing CEL expressions.",
        ].join("\n")
      : "Compact mode is active because the raw samples were too large for local model context. Use the summarized structure and examples below to draft the requested result.";

  return [
    `Task: ${aiModeLabels[mode]}`,
    buildModeInstruction(mode, pipeline, sampleOutput),
    compactInstructions,
    describeCompactSourceShape(pipeline, samplePayload),
    isStructuredAiMode(mode) ? structuredResponseRules : explainResponseRules,
    "Pipeline summary:",
    JSON.stringify(
      {
        pipeline: pipeline.pipeline,
        source: {
          type: pipeline.source.type,
          format: pipeline.source.format,
          config: summarizeConfigForPrompt(pipeline.source.config),
        },
        target: {
          type: pipeline.target.type,
          format: pipeline.target.format,
          config: summarizeConfigForPrompt(pipeline.target.config),
        },
        targetSchemaFieldCount: flattenSchemaLeafOptions(pipeline.targetSchema?.fields).length,
        existingMappingCount: pipeline.mapping.fields.length,
      },
      null,
      2,
    ),
    ...(mappingFocusedMode
      ? [
          "Locked mappings:",
          formatAppliedMappings(pipeline.mapping.fields),
          `Candidate source paths omit this common prefix when possible: ${sourcePathPrefix || "(none)"}`,
          "Unresolved target candidates:",
          formatUnresolvedTargetCandidates(
            unresolvedTargetCandidates,
            sourcePathPrefix,
          ),
        ]
      : []),
    "Source sample excerpt:",
    summarizeSampleForPrompt(pipeline.source.format, samplePayload),
    ...(sampleOutput?.trim()
      ? [
          "Target sample excerpt:",
          summarizeSampleForPrompt(pipeline.target.format, sampleOutput),
        ]
      : []),
    "Operator instructions:",
    truncateText(
      authorPrompt ||
        "Use the sample payload to infer realistic output fields and keep the result production-friendly.",
      600,
    ),
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
};

const buildCompactAiBatches = (options: {
  mode: AiDraftMode;
  pipeline: PipelineDefinition;
  samplePayload: string;
  sampleOutput?: string;
  authorPrompt: string;
  requestedMaxTokens: number;
  contextWindowSize: number;
}) => {
  const {
    mode,
    pipeline,
    samplePayload,
    sampleOutput,
    authorPrompt,
    requestedMaxTokens,
    contextWindowSize,
  } = options;
  const mappingFocusedMode = mode === "studio" || mode === "mapping";
  const unresolvedTargetCandidates = mappingFocusedMode
    ? collectUnresolvedTargetCandidates(pipeline, samplePayload)
    : [];

  if (!mappingFocusedMode || unresolvedTargetCandidates.length === 0) {
    const prompt = buildCompactAiPrompt({
      mode,
      pipeline,
      samplePayload,
      sampleOutput,
      authorPrompt,
    });
    const estimatedPromptTokens = estimatePromptTokens(prompt);

    return {
      unresolvedTargetCount: unresolvedTargetCandidates.length,
      batches: [
        {
          prompt,
          estimatedPromptTokens,
          effectiveMaxTokens: computeEffectiveMaxTokens(
            requestedMaxTokens,
            estimatedPromptTokens,
            contextWindowSize,
          ),
          batchIndex: 1,
          totalBatches: 1,
          unresolvedTargetCount: unresolvedTargetCandidates.length,
        },
      ] satisfies AiPromptBatch[],
    };
  }

  const batchSlices: TargetMatchResolution[][] = [];
  let lastAttemptedPrompt = "";

  for (let index = 0; index < unresolvedTargetCandidates.length;) {
    let end = Math.min(
      unresolvedTargetCandidates.length,
      index + maxCompactTargetsPerBatch,
    );
    let selectedSlice: TargetMatchResolution[] | undefined;

    while (end > index) {
      const slice = unresolvedTargetCandidates.slice(index, end);
      const prompt = buildCompactAiPrompt({
        mode,
        pipeline,
        samplePayload,
        sampleOutput,
        authorPrompt,
        unresolvedTargetCandidates: slice,
        batchIndex: 88,
        totalBatches: 88,
      });
      lastAttemptedPrompt = prompt;

      if (canFitPrompt(estimatePromptTokens(prompt), contextWindowSize)) {
        selectedSlice = slice;
        break;
      }

      end -= 1;
    }

    if (!selectedSlice) {
      return {
        unresolvedTargetCount: unresolvedTargetCandidates.length,
        batches: [] satisfies AiPromptBatch[],
        unfitPrompt: lastAttemptedPrompt,
      };
    }

    batchSlices.push(selectedSlice);
    index += selectedSlice.length;
  }

  const totalBatches = batchSlices.length;
  const batches = batchSlices.map<AiPromptBatch>((slice, batchOffset) => {
    const prompt = buildCompactAiPrompt({
      mode,
      pipeline,
      samplePayload,
      sampleOutput,
      authorPrompt,
      unresolvedTargetCandidates: slice,
      batchIndex: batchOffset + 1,
      totalBatches,
    });
    const estimatedPromptTokens = estimatePromptTokens(prompt);

    return {
      prompt,
      estimatedPromptTokens,
      effectiveMaxTokens: computeEffectiveMaxTokens(
        requestedMaxTokens,
        estimatedPromptTokens,
        contextWindowSize,
      ),
      batchIndex: batchOffset + 1,
      totalBatches,
      unresolvedTargetCount: slice.length,
    };
  });

  return {
    unresolvedTargetCount: unresolvedTargetCandidates.length,
    batches,
  };
};

export const buildAiRequest = (options: {
  mode: AiDraftMode;
  pipeline: PipelineDefinition;
  samplePayload: string;
  sampleOutput?: string;
  authorPrompt: string;
  requestedMaxTokens: number;
  contextWindowSize: number;
}): AiPromptBuildResult => {
  const {
    mode,
    pipeline,
    samplePayload,
    sampleOutput,
    authorPrompt,
    requestedMaxTokens,
    contextWindowSize,
  } = options;

  const fullPrompt = buildAiPrompt({
    mode,
    pipeline,
    samplePayload,
    sampleOutput,
    authorPrompt,
  });
  const estimatedFullTokens = estimatePromptTokens(fullPrompt);
  const fullCanFit = canFitPrompt(estimatedFullTokens, contextWindowSize);
  const shouldCompact =
    !fullCanFit ||
    fullPrompt.length > compactPromptCharThreshold ||
    samplePayload.trim().length > rawSampleCharThreshold ||
    (sampleOutput?.trim().length ?? 0) > rawSampleCharThreshold;

  if (!shouldCompact) {
    const effectiveMaxTokens = computeEffectiveMaxTokens(
      requestedMaxTokens,
      estimatedFullTokens,
      contextWindowSize,
    );
    return {
      prompt: fullPrompt,
      promptMode: "full",
      estimatedPromptTokens: estimatedFullTokens,
      effectiveMaxTokens,
      statusNote: "Using the full local prompt.",
      shouldMergeMappings: false,
      lockedMappingTargets: [],
      batches: [
        {
          prompt: fullPrompt,
          estimatedPromptTokens: estimatedFullTokens,
          effectiveMaxTokens,
          batchIndex: 1,
          totalBatches: 1,
          unresolvedTargetCount: 0,
        },
      ],
    };
  }

  const compactResult = buildCompactAiBatches({
    mode,
    pipeline,
    samplePayload,
    sampleOutput,
    authorPrompt,
    requestedMaxTokens,
    contextWindowSize,
  });
  const firstCompactBatch = compactResult.batches[0];

  if (!firstCompactBatch || compactResult.batches.some((batch) => !canFitPrompt(batch.estimatedPromptTokens, contextWindowSize))) {
    return {
      prompt: compactResult.unfitPrompt ?? "",
      promptMode: "unfit",
      estimatedPromptTokens: compactResult.unfitPrompt
        ? estimatePromptTokens(compactResult.unfitPrompt)
        : estimatedFullTokens,
      effectiveMaxTokens: minOutputTokens,
      statusNote:
        "Even the compact local prompt would exceed the current model context. Keeping the deterministic draft only.",
      shouldMergeMappings: false,
      lockedMappingTargets: pipeline.mapping.fields.map((mapping) => mapping.to),
      batches: [],
    };
  }

  return {
    prompt: firstCompactBatch.prompt,
    promptMode: "compact",
    estimatedPromptTokens: firstCompactBatch.estimatedPromptTokens,
    effectiveMaxTokens: firstCompactBatch.effectiveMaxTokens,
    statusNote:
      compactResult.batches.length > 1
        ? `Compacted the request into ${compactResult.batches.length} local batches covering ${compactResult.unresolvedTargetCount} unresolved targets.`
        : firstCompactBatch.effectiveMaxTokens < requestedMaxTokens
          ? `Compacted the request to local summaries and candidate matches. Reduced the response budget to ${firstCompactBatch.effectiveMaxTokens} tokens to stay within the local context window.`
          : "Compacted the request to local summaries and candidate matches to stay within the local context window.",
    shouldMergeMappings: isStructuredAiMode(mode) && ["studio", "mapping"].includes(mode),
    lockedMappingTargets: pipeline.mapping.fields.map((mapping) => mapping.to),
    batches: compactResult.batches,
  };
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
