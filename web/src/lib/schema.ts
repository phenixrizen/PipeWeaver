import type {
  FieldMapping,
  SchemaDefinition,
  SchemaField,
} from "../types/pipeline";

export interface SourceFieldOption {
  path: string;
  label: string;
  type: string;
}

type SampleRecord = Record<string, unknown>;

const TABULAR_FORMATS = new Set(["csv", "tsv", "pipe"]);

export const isTabularFormat = (format: string) => TABULAR_FORMATS.has(format);

export const createEmptySchema = (format: string): SchemaDefinition => ({
  name: format === "xml" ? "record" : undefined,
  type: "object",
  fields: [],
});

const cloneSchemaFields = (fields: SchemaField[] | undefined): SchemaField[] =>
  (fields ?? []).map((field) => ({
    ...field,
    fields: cloneSchemaFields(field.fields),
  }));

const cloneSourceField = (field: SourceFieldOption): SourceFieldOption => ({
  ...field,
});

const mergeTypes = (left: string, right: string) => {
  if (left === right) {
    return left;
  }
  if (left === "object" || right === "object") {
    return "object";
  }
  if (left === "array" || right === "array") {
    return "array";
  }
  if (
    (left === "integer" && right === "number") ||
    (left === "number" && right === "integer")
  ) {
    return "number";
  }
  if (left === "string" || right === "string") {
    return "string";
  }
  return right;
};

const mergeFieldCollections = (left: SchemaField[], right: SchemaField[]) => {
  const merged = cloneSchemaFields(left);
  right.forEach((incoming) => {
    const existing = merged.find((field) => field.name === incoming.name);
    if (!existing) {
      merged.push({
        ...incoming,
        fields: cloneSchemaFields(incoming.fields),
      });
      return;
    }
    existing.type = mergeTypes(existing.type, incoming.type);
    if (existing.type === "object" || existing.type === "array") {
      existing.fields = mergeFieldCollections(
        existing.fields ?? [],
        incoming.fields ?? [],
      );
    }
  });
  return merged;
};

const inferType = (value: unknown): string => {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null || value === undefined) {
    return "string";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "string") {
    if (/^-?\d+$/.test(value)) {
      return "integer";
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return "number";
    }
    if (/^(true|false)$/i.test(value)) {
      return "boolean";
    }
  }
  return "string";
};

const inferFieldFromValue = (name: string, value: unknown): SchemaField => {
  if (Array.isArray(value)) {
    const firstObject = value.find(
      (entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry),
    );
    return {
      name,
      type: "array",
      fields:
        firstObject && typeof firstObject === "object"
          ? inferFieldsFromObject(firstObject as Record<string, unknown>)
          : undefined,
    };
  }

  if (typeof value === "object" && value !== null) {
    return {
      name,
      type: "object",
      fields: inferFieldsFromObject(value as Record<string, unknown>),
    };
  }

  return { name, type: inferType(value) };
};

const inferFieldsFromObject = (record: Record<string, unknown>) =>
  Object.keys(record)
    .sort()
    .map((key) => inferFieldFromValue(key, record[key]));

const inferFromJsonSample = (sample: string): SchemaDefinition | undefined => {
  try {
    const parsed = JSON.parse(sample) as unknown;
    if (Array.isArray(parsed)) {
      const objectRecords = parsed.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      );
      if (!objectRecords.length) {
        return createEmptySchema("json");
      }
      return {
        type: "object",
        fields: objectRecords.reduce<SchemaField[]>(
          (merged, record) =>
            mergeFieldCollections(merged, inferFieldsFromObject(record)),
          [],
        ),
      };
    }

    if (typeof parsed === "object" && parsed !== null) {
      return {
        type: "object",
        fields: inferFieldsFromObject(parsed as Record<string, unknown>),
      };
    }
  } catch {
    return undefined;
  }

  return createEmptySchema("json");
};

const inferFromDelimitedSample = (format: string, sample: string) => {
  const delimiter =
    format === "tsv" ? "\t" : format === "pipe" ? "|" : ",";
  const headerLine = sample.split(/\r?\n/, 1)[0]?.trim();

  if (!headerLine) {
    return createEmptySchema(format);
  }

  return {
    type: "object",
    fields: headerLine
      .split(delimiter)
      .map((header) => header.trim())
      .filter(Boolean)
      .map((header, index) => ({
        name: header,
        type: "string",
        column: header,
        index,
      })),
  };
};

const parseDelimitedRows = (format: string, sample: string) => {
  const delimiter =
    format === "tsv" ? "\t" : format === "pipe" ? "|" : ",";
  const lines = sample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]
    .split(delimiter)
    .map((header) => header.trim())
    .filter(Boolean);

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index]?.trim() ?? "";
      return record;
    }, {});
  });
};

const mergeElementFields = (elements: Element[]) =>
  Array.from(
    elements.reduce<Map<string, Element[]>>((groups, element) => {
      const current = groups.get(element.tagName) ?? [];
      current.push(element);
      groups.set(element.tagName, current);
      return groups;
    }, new Map()),
  ).map(([name, grouped]) => inferFieldFromXmlElements(name, grouped));

const inferFieldFromXmlElement = (element: Element): SchemaField => {
  const childElements = Array.from(element.children);
  if (!childElements.length) {
    return {
      name: element.tagName,
      type: inferType(element.textContent?.trim() ?? ""),
    };
  }

  return {
    name: element.tagName,
    type: "object",
    fields: mergeElementFields(childElements),
  };
};

const inferFieldFromXmlElements = (name: string, elements: Element[]): SchemaField => {
  if (elements.length === 1) {
    return inferFieldFromXmlElement(elements[0]);
  }

  const mergedChildren = mergeElementFields(
    elements.flatMap((element) => Array.from(element.children)),
  );
  return {
    name,
    type: "array",
    fields: mergedChildren.length ? mergedChildren : undefined,
  };
};

const xmlElementValue = (element: Element): unknown => {
  const childElements = Array.from(element.children);
  if (!childElements.length) {
    return element.textContent?.trim() ?? "";
  }

  return Array.from(
    childElements.reduce<Map<string, Element[]>>((groups, child) => {
      const current = groups.get(child.tagName) ?? [];
      current.push(child);
      groups.set(child.tagName, current);
      return groups;
    }, new Map()),
  ).reduce<Record<string, unknown>>((record, [name, grouped]) => {
    if (grouped.length === 1) {
      record[name] = xmlElementValue(grouped[0]);
      return record;
    }

    record[name] = grouped.map((item) => xmlElementValue(item));
    return record;
  }, {});
};

const parseXmlSampleRecord = (sample: string): SampleRecord | undefined => {
  if (typeof DOMParser === "undefined") {
    return undefined;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(sample, "application/xml");
  if (document.querySelector("parsererror")) {
    return undefined;
  }

  const root = document.documentElement;
  if (!root) {
    return undefined;
  }

  return Array.from(
    Array.from(root.children).reduce<Map<string, Element[]>>((groups, child) => {
      const current = groups.get(child.tagName) ?? [];
      current.push(child);
      groups.set(child.tagName, current);
      return groups;
    }, new Map()),
  ).reduce<Record<string, unknown>>((record, [name, grouped]) => {
    if (grouped.length === 1) {
      record[name] = xmlElementValue(grouped[0]);
      return record;
    }

    record[name] = grouped.map((item) => xmlElementValue(item));
    return record;
  }, {});
};

const sampleRecord = (
  format: string,
  samplePayload: string,
): SampleRecord | undefined => {
  const sample = samplePayload.trim();
  if (!sample) {
    return undefined;
  }

  if (format === "json") {
    try {
      const parsed = JSON.parse(sample) as unknown;
      if (Array.isArray(parsed)) {
        return (parsed[0] as SampleRecord | undefined) ?? undefined;
      }
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as SampleRecord;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  if (isTabularFormat(format)) {
    return parseDelimitedRows(format, sample)[0];
  }

  if (format === "xml") {
    return parseXmlSampleRecord(sample);
  }

  return undefined;
};

const getPathValue = (value: unknown, path: string[]): unknown => {
  if (!path.length) {
    return value;
  }

  if (Array.isArray(value)) {
    const nested = value
      .map((entry) => getPathValue(entry, path))
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .filter((entry) => entry !== undefined);
    return nested;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const [head, ...rest] = path;
  return getPathValue((value as Record<string, unknown>)[head], rest);
};

const inferFromXmlSample = (sample: string): SchemaDefinition | undefined => {
  if (typeof DOMParser === "undefined") {
    return undefined;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(sample, "application/xml");
  if (document.querySelector("parsererror")) {
    return undefined;
  }

  const root = document.documentElement;
  if (!root) {
    return createEmptySchema("xml");
  }

  return {
    name: root.tagName || "record",
    type: "object",
    fields: mergeElementFields(Array.from(root.children)),
  };
};

export const inferSchemaFromSample = (
  format: string,
  samplePayload: string,
): SchemaDefinition | undefined => {
  const sample = samplePayload.trim();
  if (!sample) {
    return createEmptySchema(format);
  }

  if (isTabularFormat(format)) {
    return inferFromDelimitedSample(format, sample);
  }
  if (format === "json") {
    return inferFromJsonSample(sample);
  }
  if (format === "xml") {
    return inferFromXmlSample(sample);
  }

  return undefined;
};

export const flattenSchemaLeafOptions = (
  fields: SchemaField[] | undefined,
  prefix = "",
): SourceFieldOption[] => {
  if (!fields?.length) {
    return [];
  }

  return fields.flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : field.name;

    if ((field.type === "object" || field.type === "array") && field.fields?.length) {
      return flattenSchemaLeafOptions(field.fields, path);
    }

    return [
      {
        path,
        label: path,
        type: field.type,
      },
    ];
  });
};

export const flattenSchemaLeafPaths = (
  fields: SchemaField[] | undefined,
  prefix = "",
): string[] =>
  flattenSchemaLeafOptions(fields, prefix).map((field) => field.path);

export const inferSourceFields = (
  format: string,
  samplePayload: string,
): SourceFieldOption[] =>
  flattenSchemaLeafOptions(
    inferSchemaFromSample(format, samplePayload)?.fields,
  );

const baseFieldName = (sourcePath: string) =>
  sourcePath
    .split(".")
    .pop()
    ?.trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";

export const createFieldFromSource = (
  source: SourceFieldOption,
  existingFields: SchemaField[],
  targetFormat: string,
): SchemaField => {
  const root = baseFieldName(source.path);
  let candidate = root;
  let suffix = 2;
  while (existingFields.some((field) => field.name === candidate)) {
    candidate = `${root}_${suffix}`;
    suffix += 1;
  }

  return {
    name: candidate,
    type:
      source.type === "object"
        ? isTabularFormat(targetFormat)
          ? "string"
          : "object"
        : source.type === "array"
          ? isTabularFormat(targetFormat)
            ? "string"
            : "array"
          : source.type,
    required: false,
    column: isTabularFormat(targetFormat) ? candidate : undefined,
    index: isTabularFormat(targetFormat) ? existingFields.length : undefined,
  };
};

export const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export const scoreMatch = (source: string, target: string) => {
  const sourceTokens = normalizeToken(source);
  const targetTokens = normalizeToken(target.split(".").pop() || target);
  const overlap = sourceTokens.filter((token) =>
    targetTokens.includes(token),
  ).length;

  if (overlap === 0) {
    return 0;
  }

  const union = new Set([...sourceTokens, ...targetTokens]).size;
  return overlap / union;
};

export const upsertMapping = (
  mappings: FieldMapping[],
  source: string,
  target: string,
  sourceField?: SourceFieldOption,
) => {
  const existing = mappings.find((row) => row.to === target);
  if (existing) {
    existing.from = source;
    existing.expression = "";
    if (!existing.transforms.length) {
      existing.transforms =
        sourceField?.type === "array" ? [] : [{ type: "trim" }];
    }
    return;
  }

  mappings.push({
    from: source,
    to: target,
    required: false,
    expression: "",
    repeatMode: sourceField?.type === "array" ? "inherit" : undefined,
    transforms: sourceField?.type === "array" ? [] : [{ type: "trim" }],
  });
};

export const applySuggestedMappings = (
  mappings: FieldMapping[],
  sourceFields: SourceFieldOption[],
  targetPaths: string[],
  threshold = 0.34,
) => {
  targetPaths.forEach((target) => {
    const bestMatch = sourceFields
      .map((source) => ({ source: source.path, score: scoreMatch(source.path, target) }))
      .sort((left, right) => right.score - left.score)[0];

    if (bestMatch && bestMatch.score >= threshold) {
      const sourceField = sourceFields.find(
        (source) => source.path === bestMatch.source,
      );
      upsertMapping(mappings, bestMatch.source, target, sourceField);
    }
  });
};

export const applyDeterministicMappings = (
  mappings: FieldMapping[],
  sourceFields: SourceFieldOption[],
  targetPaths: string[],
) => {
  targetPaths.forEach((target) => {
    const targetLeaf = normalizeToken(target.split(".").pop() || target).join(" ");
    const fullTarget = normalizeToken(target).join(" ");
    const sourceField = sourceFields.find((source) => {
      const sourceLeaf = normalizeToken(
        source.path.split(".").pop() || source.path,
      ).join(" ");
      const fullSource = normalizeToken(source.path).join(" ");
      return sourceLeaf === targetLeaf || fullSource === fullTarget;
    });

    if (sourceField) {
      upsertMapping(mappings, sourceField.path, target, cloneSourceField(sourceField));
    }
  });
};

export const inferRepeatModesFromSamples = (options: {
  mappings: FieldMapping[];
  sourceFields: SourceFieldOption[];
  sourceFormat: string;
  samplePayload: string;
  targetFormat: string;
  sampleOutput: string;
}) => {
  const {
    mappings,
    sourceFields,
    sourceFormat,
    samplePayload,
    targetFormat,
    sampleOutput,
  } = options;

  if (sourceFormat !== "xml" || !isTabularFormat(targetFormat)) {
    return;
  }

  const outputRows = parseDelimitedRows(targetFormat, sampleOutput.trim());
  if (outputRows.length < 2) {
    return;
  }

  const record = sampleRecord(sourceFormat, samplePayload);
  if (!record) {
    return;
  }

  mappings.forEach((mapping) => {
    if (!mapping.from) {
      return;
    }

    const sourceField = sourceFields.find((field) => field.path === mapping.from);
    if (sourceField?.type !== "array") {
      return;
    }

    const sourceValues = getPathValue(record, mapping.from.split("."));
    if (!Array.isArray(sourceValues) || sourceValues.length < 2) {
      return;
    }

    const outputValues = outputRows
      .map((row) => row[mapping.to] ?? "")
      .filter((value) => value.length > 0);

    if (outputValues.length !== sourceValues.length) {
      return;
    }

    const normalizedSourceValues = sourceValues.map((value) => String(value).trim());
    const normalizedOutputValues = outputValues.map((value) => value.trim());
    const matches = normalizedSourceValues.every((value) =>
      normalizedOutputValues.includes(value),
    );

    if (matches) {
      mapping.repeatMode = "explode";
      delete mapping.joinDelimiter;
    }
  });
};

export const removeMappingsForTargetPath = (
  mappings: FieldMapping[],
  targetPath: string,
) => {
  for (let index = mappings.length - 1; index >= 0; index -= 1) {
    const current = mappings[index]?.to ?? "";
    if (current === targetPath || current.startsWith(`${targetPath}.`)) {
      mappings.splice(index, 1);
    }
  }
};

export const renameMappingTargets = (
  mappings: FieldMapping[],
  oldTargetPath: string,
  newTargetPath: string,
) => {
  mappings.forEach((mapping) => {
    if (mapping.to === oldTargetPath) {
      mapping.to = newTargetPath;
      return;
    }
    if (mapping.to.startsWith(`${oldTargetPath}.`)) {
      mapping.to = `${newTargetPath}${mapping.to.slice(oldTargetPath.length)}`;
    }
  });
};
