import type {
  PipelineDefinition,
  PreviewResult,
  SchemaDefinition,
} from "../types/pipeline";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

// The API client mirrors the MVP REST endpoints exposed by the Go backend.
export const api = {
  listPipelines: () => request<PipelineDefinition[]>("/api/pipelines"),
  savePipeline: (pipeline: PipelineDefinition) =>
    request<PipelineDefinition>("/api/pipelines", {
      method: "POST",
      body: JSON.stringify(pipeline),
    }),
  getPipeline: (id: string) =>
    request<PipelineDefinition>(`/api/pipelines/${id}`),
  deletePipeline: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/api/pipelines/${id}`, {
      method: "DELETE",
    }),
  inferSchema: (format: string, sample: string) =>
    request<SchemaDefinition>("/api/schema/infer", {
      method: "POST",
      body: JSON.stringify({ format, sample }),
    }),
  preview: (pipeline: PipelineDefinition, samplePayload: string) =>
    request<PreviewResult>("/api/mapping/preview", {
      method: "POST",
      body: JSON.stringify({ pipeline, samplePayload }),
    }),
};
