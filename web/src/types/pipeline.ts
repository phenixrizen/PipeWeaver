export interface Transform {
  type: string;
  value?: string | number | boolean;
  values?: string[];
  then?: string;
  else?: string;
}

export interface FieldMapping {
  from?: string;
  expression?: string;
  to: string;
  required?: boolean;
  repeatMode?: "inherit" | "preserve" | "explode";
  joinDelimiter?: string;
  transforms: Transform[];
}

export interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  column?: string;
  index?: number;
  fields?: SchemaField[];
}

export interface SchemaDefinition {
  name?: string;
  type: string;
  fields: SchemaField[];
  jsonSchema?: unknown;
  xsdNote?: string;
}

export interface ConnectorConfig {
  type: string;
  format: string;
  config: Record<string, unknown>;
}

export interface PipelineDefinition {
  pipeline: {
    id: string;
    name: string;
    description?: string;
  };
  source: ConnectorConfig;
  target: ConnectorConfig;
  mapping: {
    fields: FieldMapping[];
    rowDriverPath?: string;
  };
  targetSchema?: SchemaDefinition;
}

export interface PreviewResult {
  inputRecords: Record<string, unknown>[];
  outputRecords: Record<string, unknown>[];
  encodedOutput: string;
  validationErrors?: { path: string; message: string }[];
  durationMs: number;
}
