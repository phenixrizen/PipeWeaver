export interface SchemaField {
  name: string;
  path: string;
  type: string;
  required?: boolean;
}

export interface SchemaDefinition {
  name?: string;
  format?: string;
  fields: SchemaField[];
}

export interface Transform {
  type: string;
  value?: unknown;
  values?: string[];
  params?: Record<string, unknown>;
}

export interface FieldMapping {
  from?: string;
  to: string;
  required?: boolean;
  transforms: Transform[];
}

export interface ConnectorConfig {
  type: string;
  format: string;
  config: Record<string, unknown>;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  source: ConnectorConfig;
  target: ConnectorConfig;
  mapping: {
    fields: FieldMapping[];
  };
  sourceSchema?: SchemaDefinition;
  targetSchema?: SchemaDefinition;
  sampleInput: string;
}

export interface PreviewResult {
  pipelineId: string;
  recordCount: number;
  durationMs: number;
  output: string;
  records: Record<string, unknown>[];
  errors?: string[];
  validations?: Record<string, Array<{ path: string; message: string }>>;
}
