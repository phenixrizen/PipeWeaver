import type {
  PipelineDefinition,
  PreviewResult,
  SchemaDefinition,
} from "@/types/pipeline";

const API_BASE = "/api";

// request wraps fetch so views can share consistent JSON parsing and errors.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({ error: response.statusText }))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

export function listPipelines() {
  return request<PipelineDefinition[]>("/pipelines");
}

export function getPipeline(id: string) {
  return request<PipelineDefinition>(`/pipelines/${id}`);
}

export function savePipeline(pipeline: PipelineDefinition) {
  return request<PipelineDefinition>("/pipelines", {
    method: "POST",
    body: JSON.stringify(pipeline),
  });
}

export function previewPipeline(pipeline: PipelineDefinition, input: string) {
  return request<PreviewResult>("/mapping/preview", {
    method: "POST",
    body: JSON.stringify({ pipeline, input }),
  });
}

export function inferSchema(name: string, format: string, input: string) {
  return request<SchemaDefinition>("/schema/infer", {
    method: "POST",
    body: JSON.stringify({ name, format, input }),
  });
}
