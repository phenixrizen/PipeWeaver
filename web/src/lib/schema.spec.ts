import {
  applyHighConfidenceSuggestedMappings,
  rankTargetMatches,
  type SourceFieldOption,
} from "./schema";

const sourceField = (path: string, type = "string"): SourceFieldOption => ({
  path,
  label: path,
  type,
});

describe("schema fuzzy matching", () => {
  it("classifies a unique leaf-name match as exact", () => {
    const resolutions = rankTargetMatches(
      [
        sourceField("claim.claimant_name"),
        sourceField("claim.claim_id"),
      ],
      [sourceField("claimant_name")],
    );

    expect(resolutions[0]).toMatchObject({
      target: "claimant_name",
      confidence: "exact",
      chosenSource: "claim.claimant_name",
    });
  });

  it("keeps duplicate exact leaf-name matches ambiguous", () => {
    const resolutions = rankTargetMatches(
      [
        sourceField("claim.patient.first_name"),
        sourceField("claim.member.first_name"),
      ],
      [sourceField("first_name")],
    );

    expect(resolutions[0]).toMatchObject({
      target: "first_name",
      confidence: "medium",
      chosenSource: undefined,
    });
  });

  it("auto-applies only high-confidence fuzzy matches", () => {
    const mappings: {
      from?: string;
      expression?: string;
      to: string;
      required?: boolean;
      transforms: { type: string }[];
    }[] = [];

    applyHighConfidenceSuggestedMappings(
      mappings,
      [
        sourceField("customer.id"),
        sourceField("customer.name"),
        sourceField("invoice.amount", "number"),
      ],
      [
        sourceField("customer_id"),
        sourceField("customer_name"),
        sourceField("invoice_total", "number"),
      ],
    );

    expect(mappings).toEqual([
      {
        from: "customer.id",
        to: "customer_id",
        required: false,
        expression: "",
        transforms: [{ type: "trim" }],
      },
      {
        from: "customer.name",
        to: "customer_name",
        required: false,
        expression: "",
        transforms: [{ type: "trim" }],
      },
    ]);
  });
});
