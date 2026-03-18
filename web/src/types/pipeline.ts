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
  transforms: Transform[];
}

export interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
  fields?: SchemaField[];
}

export interface SchemaDefinition {
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
