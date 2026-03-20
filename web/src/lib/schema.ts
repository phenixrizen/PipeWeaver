import expandAcronyms from "@stdlib/nlp-expand-acronyms";
import type {
  FieldMapping,
  SchemaDefinition,
  SchemaField,
} from "../types/pipeline";

export interface SourceFieldOption {
  path: string;
  label: string;
  type: string;
  repeatable?: boolean;
  observedIndexCount?: number;
  repeatBranchPath?: string;
  pathWithinRepeatBranch?: string;
}

export interface RankedMatchCandidate {
  source: string;
  type: string;
  score: number;
  branchPenalty?: number;
  indexed?: boolean;
  observed?: boolean;
}

export type MatchResolutionBucket = "auto" | "suggested" | "unsupported";

export interface TargetMatchResolution {
  target: string;
  targetType: string;
  confidence: "exact" | "high" | "medium" | "low";
  bucket: MatchResolutionBucket;
  chosenSource?: string;
  suggestedSource?: string;
  candidates: RankedMatchCandidate[];
}

export interface TabularPreviewData {
  headers: string[];
  rows: Record<string, string>[];
}

export type SamplePreviewResolver = (path: string) => string;

type SampleRecord = Record<string, unknown>;

const TABULAR_FORMATS = new Set(["csv", "tsv", "pipe"]);
const GENERIC_PATH_WRAPPER_TOKENS = new Set([
  "envelope",
  "body",
  "header",
  "request",
  "response",
  "record",
  "records",
  "item",
  "items",
  "root",
]);
const GENERIC_FIELD_TOKENS = new Set([
  "address",
  "amount",
  "amt",
  "code",
  "date",
  "id",
  "identifier",
  "line",
  "name",
  "num",
  "number",
  "quantity",
  "qty",
  "total",
  "type",
  "value",
]);
const TOKEN_ALIASES: Record<string, string[]> = {
  begin: ["from", "start"],
  end: ["to", "through"],
  from: ["begin", "start"],
  index: ["pointer"],
  pointer: ["index"],
  start: ["begin", "from"],
  through: ["end", "to"],
  to: ["end", "through"],
};
const ENTITY_ROLE_FAMILIES = [
  { tokens: ["patient", "subscriber", "member", "insured"], penalty: 0.24 },
  {
    tokens: ["billing", "rendering", "referring", "ordering", "attending", "servicing"],
    penalty: 0.2,
  },
];
const normalizedTokenCache = new Map<string, string[]>();
const normalizedPathTokenCache = new Map<string, string[]>();
const normalizedPathSuffixTokenCache = new Map<string, string[][]>();

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

export const parseTabularPreviewData = (
  format: string,
  sample: string,
): TabularPreviewData => {
  const delimiter =
    format === "tsv" ? "\t" : format === "pipe" ? "|" : ",";
  const lines = sample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return {
      headers: [],
      rows: [],
    };
  }

  const headers = lines[0]
    .split(delimiter)
    .map((header) => header.trim())
    .filter(Boolean);

  return {
    headers,
    rows: lines.slice(1).map((line) => {
      const values = line.split(delimiter);
      return headers.reduce<Record<string, string>>((record, header, index) => {
        record[header] = values[index]?.trim() ?? "";
        return record;
      }, {});
    }),
  };
};

const parseDelimitedRows = (format: string, sample: string) =>
  parseTabularPreviewData(format, sample).rows;

const stripNamespacePrefix = (value: string) => value.split(":").pop() ?? value;

const xmlElementName = (element: Element) =>
  element.localName || stripNamespacePrefix(element.tagName);

const normalizePluralToken = (token: string) => {
  if (token.length <= 3) {
    return token;
  }
  if (token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("sses")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("ses") || token.endsWith("xes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
};

const tokenizeComparableText = (value: string, filterWrappers = false) => {
  const expanded = expandAcronyms(
    value
      .split(".")
      .map((segment) => stripNamespacePrefix(segment))
      .join(".")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([A-Za-z])/g, "$1 $2"),
  );

  return expanded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizePluralToken(token))
    .filter((token) => !filterWrappers || !GENERIC_PATH_WRAPPER_TOKENS.has(token));
};

interface ParsedPathSegment {
  key: string;
  index?: number;
}

const parsePathSegments = (path: string): ParsedPathSegment[] =>
  path.split(".").map((segment) => {
    const bracket = segment.lastIndexOf("[");
    if (bracket > 0 && segment.endsWith("]")) {
      const index = Number(segment.slice(bracket + 1, -1));
      if (Number.isInteger(index) && index > 0) {
        return {
          key: segment.slice(0, bracket),
          index,
        };
      }
    }

    return { key: segment };
  });

const applyPathIndex = (value: unknown, index?: number) => {
  if (!index) {
    return value;
  }

  if (Array.isArray(value)) {
    return value[index - 1];
  }

  return index === 1 ? value : undefined;
};

const sharedPrefixRatio = (left: string, right: string) => {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) {
    length += 1;
  }

  return limit === 0 ? 0 : length / limit;
};

const stripExplicitIndex = (segment: string) => segment.replace(/\[\d+\]$/, "");

const looksRepeatableSegmentPair = (parent: string, child: string) => {
  const normalizedParent = stripNamespacePrefix(stripExplicitIndex(parent)).toLowerCase();
  const normalizedChild = stripNamespacePrefix(stripExplicitIndex(child)).toLowerCase();

  if (!normalizedParent || !normalizedChild || normalizedParent === normalizedChild) {
    return false;
  }

  if (
    normalizedParent === `${normalizedChild}s` ||
    normalizedParent === `${normalizedChild}es`
  ) {
    return true;
  }

  if (
    normalizedParent.endsWith("ies") &&
    `${normalizedParent.slice(0, -3)}y` === normalizedChild
  ) {
    return true;
  }

  return (
    normalizedParent.endsWith("s") &&
    sharedPrefixRatio(normalizedParent, normalizedChild) >= 0.6
  );
};

const repeatableSegmentIndex = (path: string, type: string) => {
  const segments = path.split(".").map((segment) => stripNamespacePrefix(segment).trim());

  for (let index = segments.length - 1; index > 0; index -= 1) {
    if (
      index >= segments.length - 2 &&
      looksRepeatableSegmentPair(segments[index - 1], segments[index])
    ) {
      return index;
    }
  }

  return type === "array" ? segments.length - 1 : -1;
};

const repeatBranchInfo = (path: string, type: string) => {
  const segments = path.split(".");
  const repeatIndex = repeatableSegmentIndex(path, type);
  if (repeatIndex < 0 || repeatIndex >= segments.length) {
    return {
      repeatBranchPath: undefined,
      pathWithinRepeatBranch: undefined,
    };
  }

  const repeatBranchPath = segments
    .slice(0, repeatIndex + 1)
    .map((segment) => stripExplicitIndex(segment))
    .join(".");
  const pathWithinRepeatBranch = segments.slice(repeatIndex + 1).join(".");

  return {
    repeatBranchPath,
    pathWithinRepeatBranch: pathWithinRepeatBranch || undefined,
  };
};

export const describeSourceFieldPath = (
  path: string,
  type = "string",
): Pick<
  SourceFieldOption,
  "path" | "label" | "type" | "repeatable" | "repeatBranchPath" | "pathWithinRepeatBranch"
> => {
  const repeatBranch = repeatBranchInfo(path, type);
  return {
    path,
    label: path,
    type,
    repeatable: repeatableSegmentIndex(path, type) >= 0,
    repeatBranchPath: repeatBranch.repeatBranchPath,
    pathWithinRepeatBranch: repeatBranch.pathWithinRepeatBranch,
  };
};

const buildIndexedSourcePath = (
  sourceField: SourceFieldOption,
  index: number,
) => {
  if (index < 1) {
    return undefined;
  }

  const segments = sourceField.path.split(".");
  const repeatIndex = repeatableSegmentIndex(sourceField.path, sourceField.type);
  if (repeatIndex < 0 || repeatIndex >= segments.length) {
    return undefined;
  }

  return segments
    .map((segment, segmentIndex) =>
      segmentIndex === repeatIndex ? `${segment}[${index}]` : segment,
    )
    .join(".");
};

const parseTrailingTargetIndex = (path: string) => {
  const leaf = path.split(".").pop() ?? path;
  const match = leaf.match(/^(.*?)[_ ](\d+)$/);
  if (!match) {
    return undefined;
  }

  const index = Number(match[2]);
  if (!Number.isInteger(index) || index < 1) {
    return undefined;
  }

  return index;
};

const mergeElementFields = (elements: Element[]) =>
  Array.from(
    elements.reduce<Map<string, Element[]>>((groups, element) => {
      const name = xmlElementName(element);
      const current = groups.get(name) ?? [];
      current.push(element);
      groups.set(name, current);
      return groups;
    }, new Map()),
  ).map(([name, grouped]) => inferFieldFromXmlElements(name, grouped));

const inferFieldFromXmlElement = (element: Element): SchemaField => {
  const childElements = Array.from(element.children);
  if (!childElements.length) {
    return {
      name: xmlElementName(element),
      type: inferType(element.textContent?.trim() ?? ""),
    };
  }

  return {
    name: xmlElementName(element),
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
      const name = xmlElementName(child);
      const current = groups.get(name) ?? [];
      current.push(child);
      groups.set(name, current);
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
      const name = xmlElementName(child);
      const current = groups.get(name) ?? [];
      current.push(child);
      groups.set(name, current);
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

const getPathValue = (value: unknown, path: ParsedPathSegment[]): unknown => {
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
  const next = applyPathIndex((value as Record<string, unknown>)[head.key], head.index);
  return getPathValue(next, rest);
};

const previewScalars = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => previewScalars(entry));
  }

  if (typeof value === "object") {
    try {
      return [JSON.stringify(value)];
    } catch {
      return [];
    }
  }

  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
};

const summarizePreviewValues = (values: string[], maxItems = 3) => {
  if (!values.length) {
    return "";
  }

  const visible = values.slice(0, maxItems).map((value) =>
    value.length > 72 ? `${value.slice(0, 69)}...` : value,
  );

  const remainder = values.length - visible.length;
  return remainder > 0
    ? `${visible.join(", ")} (+${remainder} more)`
    : visible.join(", ");
};

export const createSamplePreviewResolver = (
  format: string,
  samplePayload: string,
  maxItems = 3,
) : SamplePreviewResolver => {
  if (!samplePayload.trim()) {
    return () => "";
  }

  if (isTabularFormat(format)) {
    const table = parseTabularPreviewData(format, samplePayload.trim());
    const cache = new Map<string, string>();

    return (fieldPath: string) => {
      if (!fieldPath.trim()) {
        return "";
      }
      const cached = cache.get(fieldPath);
      if (cached !== undefined) {
        return cached;
      }

      const preview = summarizePreviewValues(
        table.rows
          .map((row) => row[fieldPath]?.trim() ?? "")
          .filter(Boolean),
        maxItems,
      );
      cache.set(fieldPath, preview);
      return preview;
    };
  }

  const record = sampleRecord(format, samplePayload);
  if (!record) {
    return () => "";
  }

  const cache = new Map<string, string>();
  return (fieldPath: string) => {
    if (!fieldPath.trim()) {
      return "";
    }

    const cached = cache.get(fieldPath);
    if (cached !== undefined) {
      return cached;
    }

    const preview = summarizePreviewValues(
      previewScalars(getPathValue(record, parsePathSegments(fieldPath))),
      maxItems,
    );
    cache.set(fieldPath, preview);
    return preview;
  };
};

export const previewSampleValue = (
  format: string,
  samplePayload: string,
  path: string,
  maxItems = 3,
) => createSamplePreviewResolver(format, samplePayload, maxItems)(path);

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
    name: root.localName || stripNamespacePrefix(root.tagName) || "record",
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
): SourceFieldOption[] => {
  const fields = flattenSchemaLeafOptions(
    inferSchemaFromSample(format, samplePayload)?.fields,
  );
  const record = sampleRecord(format, samplePayload);

  return fields.map((field) => {
    const observedValue = record
      ? getPathValue(record, parsePathSegments(field.path))
      : undefined;
    const repeatBranch = repeatBranchInfo(field.path, field.type);

    return {
      ...field,
      repeatable: repeatableSegmentIndex(field.path, field.type) >= 0,
      observedIndexCount: Array.isArray(observedValue)
        ? observedValue.length
        : observedValue === undefined
          ? 0
          : 1,
      repeatBranchPath: repeatBranch.repeatBranchPath,
      pathWithinRepeatBranch: repeatBranch.pathWithinRepeatBranch,
    };
  });
};

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
  normalizedTokenCache.get(value) ??
  (() => {
    const tokens = tokenizeComparableText(value);
    normalizedTokenCache.set(value, tokens);
    return tokens;
  })();

const normalizePathToken = (value: string) =>
  normalizedPathTokenCache.get(value) ??
  (() => {
    const tokens = tokenizeComparableText(value, true);
    normalizedPathTokenCache.set(value, tokens);
    return tokens;
  })();

const normalizePathSuffixTokens = (value: string) =>
  normalizedPathSuffixTokenCache.get(value) ??
  (() => {
    const segments = value
      .split(".")
      .map((segment) => stripNamespacePrefix(segment).trim())
      .filter(Boolean);
    const variants: string[][] = [];
    const seen = new Set<string>();

    for (let start = Math.max(0, segments.length - 4); start < segments.length - 1; start += 1) {
      const tokens = tokenizeComparableText(segments.slice(start).join("."), true);
      if (tokens.length < 2) {
        continue;
      }

      const key = tokens.join(" ");
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      variants.push(tokens);
    }

    normalizedPathSuffixTokenCache.set(value, variants);
    return variants;
  })();

const scalarTypes = new Set(["string", "integer", "number", "boolean"]);

const expandComparableTokenSet = (tokens: string[]) => {
  const expanded = new Set<string>();
  tokens.forEach((token) => {
    expanded.add(token);
    (TOKEN_ALIASES[token] ?? []).forEach((alias) => expanded.add(alias));
  });
  return expanded;
};

const scoreTokenOverlap = (left: string[], right: string[]) => {
  if (!left.length || !right.length) {
    return 0;
  }

  const leftSet = expandComparableTokenSet(left);
  const rightSet = expandComparableTokenSet(right);
  const overlap = [...leftSet].filter((token) => rightSet.has(token)).length;
  if (overlap === 0) {
    return 0;
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return overlap / union;
};

const areTypesCompatible = (sourceType: string, targetType: string) => {
  if (sourceType === targetType) {
    return true;
  }

  return scalarTypes.has(sourceType) && scalarTypes.has(targetType);
};

const lastExplicitPathIndex = (path: string) => {
  const segments = parsePathSegments(path);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]?.index) {
      return segments[index]?.index;
    }
  }

  return undefined;
};

const missingDistinctiveTokenCount = (sourceTokens: string[], targetTokens: string[]) => {
  const sourceSet = expandComparableTokenSet(sourceTokens);
  const targetSet = expandComparableTokenSet(targetTokens);

  return [...targetSet].filter((token) => {
    if (sourceSet.has(token)) {
      return false;
    }
    if (/^\d+$/.test(token)) {
      return false;
    }
    return !GENERIC_FIELD_TOKENS.has(token);
  }).length;
};

const entityRoleMismatchPenalty = (sourceTokens: string[], targetTokens: string[]) => {
  const sourceSet = new Set(sourceTokens);
  const targetSet = new Set(targetTokens);

  return ENTITY_ROLE_FAMILIES.reduce((total, family) => {
    const sourceRoles = family.tokens.filter((token) => sourceSet.has(token));
    const targetRoles = family.tokens.filter((token) => targetSet.has(token));

    if (!sourceRoles.length || !targetRoles.length) {
      return total;
    }

    if (sourceRoles.some((token) => targetRoles.includes(token))) {
      return total;
    }

    return total + family.penalty;
  }, 0);
};

const candidateBranchPenalty = (sourcePath: string, targetPath: string) => {
  const sourceTokens = normalizePathToken(sourcePath);
  const targetSet = expandComparableTokenSet(normalizePathToken(targetPath));

  return [...new Set(sourceTokens)].filter((token) => {
    if (targetSet.has(token)) {
      return false;
    }
    return !GENERIC_FIELD_TOKENS.has(token);
  }).length;
};

export const scoreMatch = (source: string, target: string) => {
  const sourceLeaf = source.split(".").pop() || source;
  const targetLeaf = target.split(".").pop() || target;

  return scoreTokenOverlap(
    normalizeToken(sourceLeaf),
    normalizeToken(targetLeaf),
  );
};

export const scoreTargetMatch = (
  sourceField: SourceFieldOption,
  targetField: SourceFieldOption,
) => {
  const sourceLeaf = sourceField.path.split(".").pop() || sourceField.path;
  const targetLeaf = targetField.path.split(".").pop() || targetField.path;
  const sourceLeafTokens = normalizeToken(sourceLeaf);
  const targetLeafTokens = normalizeToken(targetLeaf);
  const sourcePathTokens = normalizePathToken(sourceField.path);
  const targetPathTokens = normalizePathToken(targetField.path);
  const normalizedSourceLeaf = sourceLeafTokens.join(" ");
  const normalizedTargetLeaf = targetLeafTokens.join(" ");
  const normalizedSourcePath = sourcePathTokens.join(" ");
  const normalizedTargetPath = targetPathTokens.join(" ");
  const targetIndex = parseTrailingTargetIndex(targetField.path);
  const sourceIndex = lastExplicitPathIndex(sourceField.path);

  if (
    normalizedSourcePath === normalizedTargetPath ||
    normalizedSourceLeaf === normalizedTargetLeaf
  ) {
    return 1;
  }

  const leafOverlap = scoreTokenOverlap(sourceLeafTokens, targetLeafTokens);
  const pathOverlap = scoreTokenOverlap(sourcePathTokens, targetPathTokens);
  const suffixWindowOverlap = normalizePathSuffixTokens(sourceField.path).reduce(
    (best, suffixTokens) => {
      const overlap = scoreTokenOverlap(suffixTokens, targetPathTokens);
      if (overlap === 0) {
        return best;
      }

      let suffixScore = overlap;
      if (suffixTokens.join(" ") === normalizedTargetPath) {
        suffixScore += 0.14;
      }
      if (
        targetPathTokens.length >= 2 &&
        suffixTokens.length >= targetPathTokens.length
      ) {
        suffixScore += Math.min(0.06, (targetPathTokens.length - 1) * 0.03);
      }

      return Math.max(best, Math.min(1, suffixScore));
    },
    0,
  );

  let score = leafOverlap * 0.7 + pathOverlap * 0.3;

  if (suffixWindowOverlap > 0) {
    score = Math.max(score, Math.min(0.92, suffixWindowOverlap * 0.92));
  }

  if (normalizedSourcePath.endsWith(normalizedTargetLeaf)) {
    score += 0.08;
  }

  if (normalizedTargetPath.includes(normalizedSourceLeaf)) {
    score += 0.05;
  }

  if (areTypesCompatible(sourceField.type, targetField.type)) {
    score += 0.05;
  } else if (
    sourceField.type === "array" ||
    targetField.type === "array" ||
    sourceField.type === "object" ||
    targetField.type === "object"
  ) {
    score -= 0.18;
  }

  const missingDistinctives = missingDistinctiveTokenCount(
    sourcePathTokens,
    targetPathTokens,
  );
  if (missingDistinctives > 0) {
    score -= Math.min(targetIndex ? 0.2 : 0.12, missingDistinctives * 0.06);
  }

  score -= entityRoleMismatchPenalty(sourcePathTokens, targetPathTokens);

  if (targetIndex) {
    if (sourceIndex === targetIndex) {
      score += 0.14;
      if ((sourceField.observedIndexCount ?? 0) >= targetIndex) {
        score += 0.05;
      }
    } else if (sourceIndex !== undefined) {
      score -= 0.2;
    } else if (sourceField.repeatable) {
      score -= targetIndex > 1 ? 0.18 : 0.1;
      if ((sourceField.observedIndexCount ?? 0) > 0 && (sourceField.observedIndexCount ?? 0) < targetIndex) {
        score -= 0.08;
      }
    } else if (targetIndex > 1) {
      score -= 0.1;
    }
  }

  return Math.max(0, Math.min(score, 0.99));
};

const classifyMatchConfidence = (candidates: RankedMatchCandidate[]) => {
  const best = candidates[0];
  const second = candidates[1];

  if (!best) {
    return "low" as const;
  }

  const rawGap = (best.score ?? 0) - (second?.score ?? 0);
  if (best.score >= 0.995 && rawGap >= 0.12) {
    return "exact" as const;
  }

  const scoreGap = candidateEffectiveGap(candidates);
  if (best.score >= 0.74 && scoreGap >= 0.12) {
    return "high" as const;
  }

  if (best.score >= 0.42) {
    return "medium" as const;
  }

  return "low" as const;
};

const candidateLeafSignature = (sourcePath: string) =>
  normalizeToken(sourcePath.split(".").pop() || sourcePath).join(" ");

const candidateEffectiveGap = (candidates: RankedMatchCandidate[]) => {
  const best = candidates[0];
  const second = candidates[1];
  if (!best) {
    return 0;
  }

  const rawGap = (best.score ?? 0) - (second?.score ?? 0);
  if (!second || Math.abs(rawGap) > 0.000001) {
    return rawGap;
  }

  const bestLeaf = candidateLeafSignature(best.source);
  const secondLeaf = candidateLeafSignature(second.source);
  if (!bestLeaf || bestLeaf !== secondLeaf) {
    return rawGap;
  }

  const bestIndex = lastExplicitPathIndex(best.source);
  const secondIndex = lastExplicitPathIndex(second.source);
  if ((bestIndex ?? null) !== (secondIndex ?? null)) {
    return rawGap;
  }

  const penaltyGap = (second.branchPenalty ?? 0) - (best.branchPenalty ?? 0);
  if (penaltyGap < 1) {
    return rawGap;
  }

  return rawGap + Math.min(0.16, penaltyGap * 0.12);
};

const classifyResolutionBucket = (
  candidates: RankedMatchCandidate[],
  confidence: "exact" | "high" | "medium" | "low",
): MatchResolutionBucket => {
  const best = candidates[0];
  if (!best) {
    return "unsupported";
  }

  if (
    (confidence === "exact" || confidence === "high") &&
    (best.observed ?? true)
  ) {
    return "auto";
  }

  const scoreGap = candidateEffectiveGap(candidates);
  if (
    (best.score >= 0.7 && scoreGap >= 0.05) ||
    (best.score >= 0.72 && scoreGap >= 0.05) ||
    (best.score >= 0.65 && scoreGap >= 0.1) ||
    (best.score >= 0.6 && scoreGap >= 0.18)
  ) {
    return "suggested";
  }

  if (best.indexed && best.score >= 0.5 && scoreGap >= 0.08) {
    return "suggested";
  }

  return "unsupported";
};

const createCandidate = (
  sourceField: SourceFieldOption,
  targetField: SourceFieldOption,
  overridePath?: string,
  options?: {
    indexed?: boolean;
    observed?: boolean;
  },
): RankedMatchCandidate => ({
  source: overridePath ?? sourceField.path,
  type:
    options?.indexed && sourceField.type === "array" ? "string" : sourceField.type,
  branchPenalty: candidateBranchPenalty(
    overridePath ?? sourceField.path,
    targetField.path,
  ),
  score: scoreTargetMatch(
    {
      ...sourceField,
      path: overridePath ?? sourceField.path,
      type:
        options?.indexed && sourceField.type === "array"
          ? "string"
          : sourceField.type,
    },
    targetField,
  ),
  indexed: options?.indexed,
  observed: options?.observed,
});

const rankCandidatesForTarget = (
  sourceFields: SourceFieldOption[],
  targetField: SourceFieldOption,
) => {
  const targetIndex = parseTrailingTargetIndex(targetField.path);
  const candidatesBySource = new Map<string, RankedMatchCandidate>();

  sourceFields.forEach((sourceField) => {
    const indexedPath =
      targetIndex && sourceField.repeatable
        ? buildIndexedSourcePath(sourceField, targetIndex)
        : undefined;

    if (!(targetIndex && indexedPath && indexedPath !== sourceField.path)) {
      const directCandidate = createCandidate(sourceField, targetField, sourceField.path, {
        indexed: false,
        observed: true,
      });
      if (directCandidate.score > 0) {
        candidatesBySource.set(directCandidate.source, directCandidate);
      }
    }

    if (!targetIndex || !indexedPath || indexedPath === sourceField.path) {
      return;
    }

    const indexedCandidate = createCandidate(sourceField, targetField, indexedPath, {
      indexed: true,
      observed: (sourceField.observedIndexCount ?? 0) >= targetIndex,
    });
    if (indexedCandidate.score === 0) {
      return;
    }

    const existing = candidatesBySource.get(indexedPath);
    if (!existing || indexedCandidate.score > existing.score) {
      candidatesBySource.set(indexedPath, indexedCandidate);
    }
  });

  return Array.from(candidatesBySource.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftObserved = left.observed ? 1 : 0;
      const rightObserved = right.observed ? 1 : 0;
      if (rightObserved !== leftObserved) {
        return rightObserved - leftObserved;
      }

      const leftPenalty = left.branchPenalty ?? 0;
      const rightPenalty = right.branchPenalty ?? 0;
      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }

      return left.source.length - right.source.length;
    })
    .slice(0, 3);
};

export const rankTargetMatches = (
  sourceFields: SourceFieldOption[],
  targetFields: SourceFieldOption[],
) =>
  targetFields.map<TargetMatchResolution>((targetField) => {
    const candidates = rankCandidatesForTarget(sourceFields, targetField);
    const confidence = classifyMatchConfidence(candidates);
    const bucket = classifyResolutionBucket(candidates, confidence);

    return {
      target: targetField.path,
      targetType: targetField.type,
      confidence,
      bucket,
      chosenSource: bucket === "auto" ? candidates[0]?.source : undefined,
      suggestedSource: bucket === "suggested" ? candidates[0]?.source : undefined,
      candidates,
    };
  });

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

export const applyResolutionMapping = (
  mappings: FieldMapping[],
  resolution: TargetMatchResolution,
) => {
  const candidate =
    resolution.bucket === "auto" || resolution.bucket === "suggested"
      ? resolution.candidates[0]
      : undefined;
  if (!candidate) {
    return;
  }

  upsertMapping(mappings, candidate.source, resolution.target, {
    path: candidate.source,
    label: candidate.source,
    type: candidate.type,
  });
};

export const applyHighConfidenceSuggestedMappings = (
  mappings: FieldMapping[],
  sourceFields: SourceFieldOption[],
  targetFields: SourceFieldOption[],
) => {
  rankTargetMatches(sourceFields, targetFields).forEach((resolution) => {
    if (resolution.bucket !== "auto") {
      return;
    }
    applyResolutionMapping(mappings, resolution);
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
    const fullTarget = normalizePathToken(target).join(" ");
    const matchingSources = sourceFields.filter((source) => {
      const sourceLeaf = normalizeToken(
        source.path.split(".").pop() || source.path,
      ).join(" ");
      const fullSource = normalizePathToken(source.path).join(" ");
      return sourceLeaf === targetLeaf || fullSource === fullTarget;
    });

    if (matchingSources.length === 1) {
      const sourceField = matchingSources[0];
      upsertMapping(mappings, sourceField.path, target, cloneSourceField(sourceField));
    }
  });
};

const firstScalarPreview = (value: unknown) => previewScalars(value)[0]?.trim() ?? "";

const valuesAlignExactly = (left: string[], right: string[]) =>
  left.length > 0 &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const inferRowDriverPathFromSamples = (options: {
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
    return undefined;
  }

  const outputRows = parseDelimitedRows(targetFormat, sampleOutput.trim());
  if (outputRows.length < 2) {
    return undefined;
  }

  const record = sampleRecord(sourceFormat, samplePayload);
  if (!record) {
    return undefined;
  }

  const branchEvidence = new Map<
    string,
    {
      matchedTargets: Set<string>;
      matchedSources: Set<string>;
      branchLength: number;
      segmentCount: number;
    }
  >();

  mappings.forEach((mapping) => {
    if (!mapping.from) {
      return;
    }

    const sourceField = sourceFields.find((field) => field.path === mapping.from);
    if (!sourceField?.repeatBranchPath) {
      return;
    }

    const branchValue = getPathValue(
      record,
      parsePathSegments(sourceField.repeatBranchPath),
    );
    const branchItems = Array.isArray(branchValue)
      ? branchValue
      : branchValue === undefined
        ? []
        : [branchValue];
    if (branchItems.length < 2 || branchItems.length !== outputRows.length) {
      return;
    }

    const outputValues = outputRows
      .map((row) => row[mapping.to] ?? "")
      .map((value) => value.trim());
    if (!outputValues.some(Boolean)) {
      return;
    }

    const branchValues = branchItems.map((item) => {
      const scopedValue = sourceField.pathWithinRepeatBranch
        ? getPathValue(item, parsePathSegments(sourceField.pathWithinRepeatBranch))
        : item;
      return firstScalarPreview(scopedValue);
    });
    const matches = valuesAlignExactly(branchValues, outputValues);
    if (!matches) {
      return;
    }

    const existing = branchEvidence.get(sourceField.repeatBranchPath) ?? {
      matchedTargets: new Set<string>(),
      matchedSources: new Set<string>(),
      branchLength: branchItems.length,
      segmentCount: sourceField.repeatBranchPath.split(".").length,
    };
    existing.matchedTargets.add(mapping.to);
    existing.matchedSources.add(mapping.from);
    branchEvidence.set(sourceField.repeatBranchPath, existing);
  });

  return Array.from(branchEvidence.entries())
    .sort((left, right) => {
      const leftMatchCount =
        left[1].matchedTargets.size + left[1].matchedSources.size;
      const rightMatchCount =
        right[1].matchedTargets.size + right[1].matchedSources.size;
      if (rightMatchCount !== leftMatchCount) {
        return rightMatchCount - leftMatchCount;
      }
      if (right[1].segmentCount !== left[1].segmentCount) {
        return right[1].segmentCount - left[1].segmentCount;
      }
      if (right[1].branchLength !== left[1].branchLength) {
        return right[1].branchLength - left[1].branchLength;
      }
      return left[0].localeCompare(right[0]);
    })
    .find(([, evidence]) =>
      evidence.matchedTargets.size > 0 || evidence.matchedSources.size > 0,
    )?.[0];
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
  } = options;

  if (sourceFormat !== "xml" || !isTabularFormat(targetFormat)) {
    return;
  }

  mappings.forEach((mapping) => {
    const sourceField = mapping.from
      ? sourceFields.find((field) => field.path === mapping.from)
      : undefined;
    if (!sourceField || sourceField.type !== "array") {
      return;
    }

    const sourceValues = getPathValue(
      sampleRecord(sourceFormat, samplePayload),
      parsePathSegments(mapping.from ?? ""),
    );
    if (!Array.isArray(sourceValues)) {
      return;
    }
    mapping.repeatMode = "inherit";
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
