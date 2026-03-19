import {
  aiModelOptions,
  buildAiPrompt,
  defaultAiInstruction,
  normalizeStructuredAiResponseText,
  parseAiResponse,
} from "./ai";
import { defaultPipeline, defaultSamplePayload } from "./defaults";

describe("ai helpers", () => {
  it("builds a studio prompt with current pipeline context", () => {
    const prompt = buildAiPrompt({
      mode: "studio",
      pipeline: defaultPipeline(),
      samplePayload: defaultSamplePayload,
      authorPrompt: defaultAiInstruction("studio"),
    });

    expect(prompt).toContain("Task: Draft schema + mappings");
    expect(prompt).toContain("Current pipeline JSON:");
    expect(prompt).toContain("Sample payload:");
  });

  it("describes flat output columns for tabular targets", () => {
    const pipeline = defaultPipeline();
    pipeline.target.format = "csv";

    const prompt = buildAiPrompt({
      mode: "studio",
      pipeline,
      samplePayload: defaultSamplePayload,
      authorPrompt: defaultAiInstruction("studio", pipeline),
    });

    expect(prompt).toContain("Target format: csv");
    expect(prompt).toContain("flat ordered column list");
    expect(prompt).toContain("customer_id (string)");
  });

  it("describes xml target naming when drafting xml output", () => {
    const pipeline = defaultPipeline();
    pipeline.source.format = "xml";
    pipeline.target.format = "xml";

    const prompt = buildAiPrompt({
      mode: "schema",
      pipeline,
      samplePayload:
        "<order><header><order_number>SO-1001</order_number></header></order>",
      authorPrompt: defaultAiInstruction("schema", pipeline),
    });

    expect(prompt).toContain("Target format: xml");
    expect(prompt).toContain("targetSchema.name");
    expect(prompt).toContain("header.order_number (string)");
  });

  it("treats target sample output as the authoritative schema contract", () => {
    const pipeline = defaultPipeline();
    pipeline.target.format = "csv";
    pipeline.targetSchema = {
      type: "object",
      fields: [{ name: "claim_id", type: "string", column: "claim_id" }],
    };

    const prompt = buildAiPrompt({
      mode: "studio",
      pipeline,
      samplePayload: "<envelope><claim><claim_id>CLM-1</claim_id></claim></envelope>",
      sampleOutput: "claim_id\nCLM-1",
      authorPrompt: defaultAiInstruction("studio", pipeline),
    });

    expect(prompt).toContain("Target sample output:");
    expect(prompt).toContain("authoritative");
    expect(prompt).not.toContain("Generate a concise summary, an improved pipelineDescription, a targetSchema, and mappingFields.");
  });

  it("uses markdown instructions for explain mode instead of the JSON contract", () => {
    const prompt = buildAiPrompt({
      mode: "explain",
      pipeline: defaultPipeline(),
      samplePayload: defaultSamplePayload,
      authorPrompt: defaultAiInstruction("explain"),
    });

    expect(prompt).toContain("Return operator-facing markdown, not JSON.");
    expect(prompt).not.toContain("Return valid JSON with this shape:");
  });

  it("parses valid AI JSON payloads", () => {
    expect(
      parseAiResponse(
        '{"summary":"Ready","mappingFields":[],"pipelineDescription":"ok"}',
      ),
    ).toEqual({
      summary: "Ready",
      mappingFields: [],
      pipelineDescription: "ok",
    });
  });

  it("rejects payloads without a summary", () => {
    expect(() => parseAiResponse('{"mappingFields":[]}')).toThrow(
      "The AI response did not include a valid summary.",
    );
  });

  it("extracts JSON when the model wraps the response in extra text", () => {
    expect(
      parseAiResponse(
        'Here is the draft:\n{"summary":"Ready","mappingFields":[]}\nThanks.',
      ),
    ).toEqual({
      summary: "Ready",
      mappingFields: [],
    });
  });

  it("normalizes repeated structured output down to one JSON object", () => {
    expect(
      normalizeStructuredAiResponseText(
        '{"summary":"Ready","mappingFields":[]}\n{"summary":"Duplicate","mappingFields":[]}',
      ),
    ).toBe('{\n  "summary": "Ready",\n  "mappingFields": []\n}');
  });

  it("only exposes the curated local models", () => {
    expect(aiModelOptions.map((option) => option.id)).toEqual([
      "Llama-3.1-8B-Instruct-q4f16_1-MLC",
      "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
      "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
      "Phi-3.5-mini-instruct-q4f16_1-MLC",
    ]);
  });
});
