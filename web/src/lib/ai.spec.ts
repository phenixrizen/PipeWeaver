import { buildAiPrompt, defaultAiInstruction, parseAiResponse } from "./ai";
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
});
