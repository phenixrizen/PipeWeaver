import { evaluate, parse } from "@marcbachmann/cel-js";

export interface ExpressionValidationResult {
  valid: boolean;
  message: string;
  value?: unknown;
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

// validateExpression checks CEL syntax in the browser and, when possible, evaluates it against the first sample record.
export const validateExpression = (
  expression: string | undefined,
  samplePayload: string,
  format: string,
): ExpressionValidationResult => {
  if (!expression || expression.trim().length === 0) {
    return { valid: true, message: "No expression set." };
  }

  try {
    parse(expression);
  } catch (error) {
    return {
      valid: false,
      message:
        error instanceof Error ? error.message : "Invalid CEL expression.",
    };
  }

  const record = sampleRecord(samplePayload, format);
  if (!record) {
    return { valid: true, message: "CEL syntax looks good." };
  }

  try {
    const value = evaluate(expression, celContext(record));
    return {
      valid: true,
      value,
      message: `CEL OK${value !== undefined ? ` · Example result: ${JSON.stringify(value)}` : ""}`,
    };
  } catch (error) {
    return {
      valid: false,
      message:
        error instanceof Error ? error.message : "CEL evaluation failed.",
    };
  }
};

// celContext mirrors the backend activation model by exposing `record` and top-level identifier-safe fields.
const celContext = (
  record: Record<string, unknown>,
): Record<string, unknown> => {
  const context: Record<string, unknown> = { record };
  Object.entries(record).forEach(([key, value]) => {
    if (identifierPattern.test(key)) {
      context[key] = value;
    }
  });
  return context;
};

const sampleRecord = (
  samplePayload: string,
  format: string,
): Record<string, unknown> | undefined => {
  const normalizedFormat = format.toLowerCase();
  try {
    switch (normalizedFormat) {
      case "json":
        return jsonRecord(samplePayload);
      case "csv":
        return delimitedRecord(samplePayload, ",");
      case "tsv":
        return delimitedRecord(samplePayload, "\t");
      case "pipe":
      case "pipe-delimited":
        return delimitedRecord(samplePayload, "|");
      case "xml":
        return xmlRecord(samplePayload);
      default:
        return undefined;
    }
  } catch (_error) {
    return undefined;
  }
};

const jsonRecord = (
  samplePayload: string,
): Record<string, unknown> | undefined => {
  if (!samplePayload.trim()) {
    return undefined;
  }

  const value = JSON.parse(samplePayload) as unknown;
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown>) ?? undefined;
  }
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const delimitedRecord = (
  samplePayload: string,
  separator: string,
): Record<string, unknown> | undefined => {
  const lines = samplePayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return undefined;
  }

  const headers = lines[0].split(separator);
  const values = lines[1].split(separator);
  return headers.reduce<Record<string, unknown>>((record, header, index) => {
    record[header] = values[index] ?? "";
    return record;
  }, {});
};

const xmlRecord = (
  samplePayload: string,
): Record<string, unknown> | undefined => {
  if (!samplePayload.trim()) {
    return undefined;
  }

  const document = new DOMParser().parseFromString(
    samplePayload,
    "application/xml",
  );
  const root = document.documentElement;
  if (!root || root.nodeName === "parsererror") {
    return undefined;
  }
  return elementRecord(root);
};

const elementRecord = (element: Element): Record<string, unknown> => {
  const childElements = Array.from(element.children);
  if (childElements.length === 0) {
    return { [element.nodeName]: element.textContent?.trim() ?? "" };
  }

  return childElements.reduce<Record<string, unknown>>((record, child) => {
    if (child.children.length === 0) {
      record[child.nodeName] = child.textContent?.trim() ?? "";
      return record;
    }
    record[child.nodeName] = elementRecord(child);
    return record;
  }, {});
};
