import {
  applyResolutionMapping,
  applyHighConfidenceSuggestedMappings,
  applyDeterministicMappings,
  inferRowDriverPathFromSamples,
  inferSourceFields,
  rankTargetMatches,
  type SourceFieldOption,
} from "./schema";

const sourceField = (
  path: string,
  type = "string",
  overrides: Partial<SourceFieldOption> = {},
): SourceFieldOption => ({
  path,
  label: path,
  type,
  ...overrides,
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

  it("matches camelCase XML leaves against underscored target headers", () => {
    const resolutions = rankTargetMatches(
      [
        sourceField("Body.CodeEditClaims.Claims.Claim.Patient.DateOfBirth"),
        sourceField("Body.CodeEditClaims.Claims.Claim.Patient.Name.FirstName"),
      ],
      [sourceField("Patient_Date_of_Birth")],
    );

    expect(resolutions[0]).toMatchObject({
      target: "Patient_Date_of_Birth",
      confidence: "high",
      chosenSource: "Body.CodeEditClaims.Claims.Claim.Patient.DateOfBirth",
    });
  });

  it("penalizes explicit entity-role mismatches like subscriber to patient", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField("Body.CodeEditClaims.Claims.Claim.Patient.DateOfBirth"),
        sourceField("Body.CodeEditClaims.Claims.Claim.Accident.Date"),
      ],
      [sourceField("Subscriber_Date_of_Birth")],
    );

    expect(resolution).toMatchObject({
      target: "Subscriber_Date_of_Birth",
      bucket: "unsupported",
      chosenSource: undefined,
      suggestedSource: undefined,
    });
  });

  it("promotes unique path suffix matches to high confidence", () => {
    const resolutions = rankTargetMatches(
      [
        sourceField("Body.CodeEditClaims.Claims.Claim.Type"),
        sourceField("Body.CodeEditClaims.Claims.Claim.Referral.Type"),
        sourceField("Body.CodeEditClaims.Header.RequestType"),
      ],
      [sourceField("Claim_Type")],
    );

    expect(resolutions[0]).toMatchObject({
      target: "Claim_Type",
      confidence: "high",
      chosenSource: "Body.CodeEditClaims.Claims.Claim.Type",
    });
  });

  it("uses branch penalties to break equal-score referral ties", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Referral.Services.Service.ProcedureCode",
        ),
        sourceField("Body.CodeEditClaims.Claims.Claim.Services.Service.ProcedureCode"),
      ],
      [sourceField("Procedure_Code")],
    );

    expect(resolution).toMatchObject({
      target: "Procedure_Code",
      confidence: "high",
      bucket: "auto",
      chosenSource:
        "Body.CodeEditClaims.Claims.Claim.Services.Service.ProcedureCode",
    });
  });

  it("keeps strong status matches in the suggested bucket when the best candidate is clearly ahead", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField("Body.CodeEditClaims.Claims.Claim.AdjudicationData.ClaimStatus"),
        sourceField("Body.CodeEditClaims.Claims.Claim.ClaimCodes"),
      ],
      [sourceField("Claim_Status_Code")],
    );

    expect(resolution).toMatchObject({
      target: "Claim_Status_Code",
      bucket: "suggested",
      suggestedSource: "Body.CodeEditClaims.Claims.Claim.AdjudicationData.ClaimStatus",
    });
  });

  it("treats pointer and index as equivalent tokens for ranking", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeIndex",
        ),
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeType",
        ),
      ],
      [sourceField("Diagnosis_Code_Pointer_1")],
    );

    expect(resolution).toMatchObject({
      target: "Diagnosis_Code_Pointer_1",
      chosenSource:
        "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeIndex",
    });
  });

  it("prefers the structurally simpler branch when a detour segment does not appear in the target", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeValue",
        ),
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Referral.Diagnoses.Diagnosis[1].CodeValue",
        ),
      ],
      [sourceField("Value_Code_1")],
    );

    expect(resolution.candidates[0]?.source).toBe(
      "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeValue",
    );
  });

  it("keeps semantic ties unresolved when branch penalties do not distinguish them", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeType",
        ),
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeValue",
        ),
      ],
      [sourceField("Health_Care_Diagnosis_Code_1")],
    );

    expect(resolution).toMatchObject({
      target: "Health_Care_Diagnosis_Code_1",
      confidence: "medium",
      bucket: "unsupported",
      chosenSource: undefined,
      suggestedSource: undefined,
    });
  });

  it("prefers indexed repeatable candidates over vague base paths for numbered targets", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis.CodeValue",
          "string",
          { repeatable: true, observedIndexCount: 3 },
        ),
      ],
      [sourceField("Health_Care_Diagnosis_Code_2")],
    );

    expect(resolution).toMatchObject({
      target: "Health_Care_Diagnosis_Code_2",
      bucket: "suggested",
      suggestedSource:
        "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[2].CodeValue",
    });
  });

  it("prefers directional date fields over generic date leaves", () => {
    const [resolution] = rankTargetMatches(
      [
        sourceField("Body.CodeEditClaims.Claims.Claim.ServiceDate"),
        sourceField("Body.CodeEditClaims.Claims.Claim.Services.Service.FromDate"),
        sourceField("Body.CodeEditClaims.Claims.Claim.Services.Service.ToDate"),
      ],
      [sourceField("Service_Date_Start")],
    );

    expect(resolution).toMatchObject({
      target: "Service_Date_Start",
      chosenSource: "Body.CodeEditClaims.Claims.Claim.Services.Service.FromDate",
    });
  });

  it("classifies strong numbered structural matches as suggestions before auto-applying them", () => {
    const resolutions = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis.CodeValue",
          "string",
          { repeatable: true, observedIndexCount: 1 },
        ),
      ],
      [sourceField("Health_Care_Diagnosis_Code_1")],
    );

    expect(resolutions[0]).toMatchObject({
      target: "Health_Care_Diagnosis_Code_1",
      confidence: "medium",
      bucket: "suggested",
      chosenSource: undefined,
      suggestedSource:
        "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeValue",
    });
  });

  it("applies a suggested indexed match using the ranked alias path", () => {
    const mappings: {
      from?: string;
      expression?: string;
      to: string;
      required?: boolean;
      transforms: { type: string }[];
    }[] = [];

    const [resolution] = rankTargetMatches(
      [
        sourceField(
          "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis.CodeValue",
          "string",
          { repeatable: true, observedIndexCount: 1 },
        ),
      ],
      [sourceField("Health_Care_Diagnosis_Code_1")],
    );

    applyResolutionMapping(mappings, resolution);

    expect(mappings).toEqual([
      {
        from: "Body.CodeEditClaims.Claims.Claim.Diagnoses.Diagnosis[1].CodeValue",
        to: "Health_Care_Diagnosis_Code_1",
        required: false,
        expression: "",
        transforms: [{ type: "trim" }],
      },
    ]);
  });

  it("does not auto-apply deterministic matches when the exact source leaf is ambiguous", () => {
    const mappings: {
      from?: string;
      expression?: string;
      to: string;
      required?: boolean;
      transforms: { type: string }[];
    }[] = [];

    applyDeterministicMappings(
      mappings,
      [
        sourceField("claim.id"),
        sourceField("patient.id"),
      ],
      ["id"],
    );

    expect(mappings).toEqual([]);
  });

  it("drops XML namespace prefixes when inferring source fields", () => {
    const fields = inferSourceFields(
      "xml",
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <CodeEditClaims xmlns="urn:test">
      <Claim>
        <DateOfBirth>20161225</DateOfBirth>
      </Claim>
    </CodeEditClaims>
  </s:Body>
</s:Envelope>`,
    );

    expect(fields.map((field) => field.path)).toContain(
      "Body.CodeEditClaims.Claim.DateOfBirth",
    );
    expect(fields.some((field) => field.path.includes(":"))).toBe(false);
  });

  it("captures repeated XML branch metadata for leaf fields inside repeated objects", () => {
    const fields = inferSourceFields(
      "xml",
      `<Envelope>
  <Body>
    <Claim>
      <Referral>
        <Services>
          <Service>
            <ProcedureCode>97153</ProcedureCode>
          </Service>
          <Service>
            <ProcedureCode>97155</ProcedureCode>
          </Service>
        </Services>
      </Referral>
    </Claim>
  </Body>
</Envelope>`,
    );

    expect(
      fields.find(
        (field) => field.path === "Body.Claim.Referral.Services.Service.ProcedureCode",
      ),
    ).toMatchObject({
      repeatable: true,
      repeatBranchPath: "Body.Claim.Referral.Services.Service",
      pathWithinRepeatBranch: "ProcedureCode",
    });
  });

  it("infers a primary row-driver path from repeated XML branch values that match output rows", () => {
    const sourceFields = inferSourceFields(
      "xml",
      `<Envelope>
  <Body>
    <Claim>
      <Referral>
        <Services>
          <Service>
            <ProcedureCode>97153</ProcedureCode>
            <LineNumber>1</LineNumber>
          </Service>
          <Service>
            <ProcedureCode>97155</ProcedureCode>
            <LineNumber>2</LineNumber>
          </Service>
        </Services>
      </Referral>
    </Claim>
  </Body>
</Envelope>`,
    );

    const rowDriverPath = inferRowDriverPathFromSamples({
      mappings: [
        {
          from: "Body.Claim.Referral.Services.Service.ProcedureCode",
          to: "Procedure_Code",
          required: false,
          expression: "",
          transforms: [{ type: "trim" }],
        },
        {
          from: "Body.Claim.Referral.Services.Service.LineNumber",
          to: "Line_Number",
          required: false,
          expression: "",
          transforms: [{ type: "trim" }],
        },
      ],
      sourceFields,
      sourceFormat: "xml",
      samplePayload: `<Envelope>
  <Body>
    <Claim>
      <Referral>
        <Services>
          <Service>
            <ProcedureCode>97153</ProcedureCode>
            <LineNumber>1</LineNumber>
          </Service>
          <Service>
            <ProcedureCode>97155</ProcedureCode>
            <LineNumber>2</LineNumber>
          </Service>
        </Services>
      </Referral>
    </Claim>
  </Body>
</Envelope>`,
      targetFormat: "csv",
      sampleOutput: "Procedure_Code,Line_Number\n97153,1\n97155,2",
    });

    expect(rowDriverPath).toBe("Body.Claim.Referral.Services.Service");
  });
});
