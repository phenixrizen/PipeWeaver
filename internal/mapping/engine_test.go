package mapping

import (
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
)

func TestApply(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{From: "full_name", To: "customer.name", Transforms: []Transform{{Type: "trim"}}},
		{From: "amount", To: "invoice.amount", Transforms: []Transform{{Type: "to_float"}}},
		{To: "invoice.currency", Transforms: []Transform{{Type: "default", Value: "USD"}}},
	}}
	input := []formats.Record{{"full_name": " Ada ", "amount": "10.5"}}
	targetSchema := &schema.Definition{Type: schema.TypeObject, Fields: []schema.Field{{Name: "customer", Type: schema.TypeObject, Required: true}, {Name: "invoice", Type: schema.TypeObject, Required: true}}}

	result, err := Apply(spec, input, targetSchema, ApplyOptions{})
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if len(result.ValidationErrors) != 0 {
		t.Fatalf("unexpected validation errors: %#v", result.ValidationErrors)
	}
	name, _ := formats.GetPath(result.Records[0], "customer.name")
	if name != "Ada" {
		t.Fatalf("unexpected mapped name: %#v", name)
	}
}

func TestApplyWithCELExpression(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{Expression: `record.first_name + ' ' + record.last_name`, To: "customer.name"},
		{Expression: `amount != '' ? amount : '0'`, To: "invoice.raw_amount"},
	}}
	input := []formats.Record{{"first_name": "Ada", "last_name": "Lovelace", "amount": "12.50"}}

	result, err := Apply(spec, input, nil, ApplyOptions{})
	if err != nil {
		t.Fatalf("apply with expression failed: %v", err)
	}
	name, _ := formats.GetPath(result.Records[0], "customer.name")
	if name != "Ada Lovelace" {
		t.Fatalf("unexpected expression value: %#v", name)
	}
	amount, _ := formats.GetPath(result.Records[0], "invoice.raw_amount")
	if amount != "12.50" {
		t.Fatalf("unexpected expression amount: %#v", amount)
	}
}

func TestApplyWithCommonTransforms(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{From: "full_name", To: "output.normalized_name", Transforms: []Transform{{Type: "normalize_whitespace"}}},
		{From: "customer_id", To: "output.prefixed_id", Transforms: []Transform{{Type: "prefix", Value: "CUST-"}}},
		{From: "status", To: "output.replaced_status", Transforms: []Transform{{Type: "replace", Values: []string{"pending", "ready"}}}},
		{From: "preferred_name", To: "output.display_name", Transforms: []Transform{{Type: "coalesce", Values: []string{"nickname", "first_name"}, Value: "Unknown"}}},
		{From: "postal_code", To: "output.short_postal", Transforms: []Transform{{Type: "substring", Values: []string{"0", "5"}}}},
	}}
	input := []formats.Record{{
		"full_name":      "  Ada   Lovelace  ",
		"customer_id":    "1001",
		"status":         "pending review",
		"preferred_name": "",
		"nickname":       "",
		"first_name":     "Ada",
		"postal_code":    "78701-1234",
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{})
	if err != nil {
		t.Fatalf("apply with common transforms failed: %v", err)
	}

	record := result.Records[0]
	if value, _ := formats.GetPath(record, "output.normalized_name"); value != "Ada Lovelace" {
		t.Fatalf("unexpected normalized name: %#v", value)
	}
	if value, _ := formats.GetPath(record, "output.prefixed_id"); value != "CUST-1001" {
		t.Fatalf("unexpected prefixed id: %#v", value)
	}
	if value, _ := formats.GetPath(record, "output.replaced_status"); value != "ready review" {
		t.Fatalf("unexpected replaced status: %#v", value)
	}
	if value, _ := formats.GetPath(record, "output.display_name"); value != "Ada" {
		t.Fatalf("unexpected coalesced display name: %#v", value)
	}
	if value, _ := formats.GetPath(record, "output.short_postal"); value != "78701" {
		t.Fatalf("unexpected substring result: %#v", value)
	}
}

func TestApplyWithInvalidSubstringConfig(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{From: "postal_code", To: "output.short_postal", Transforms: []Transform{{Type: "substring", Values: []string{"abc"}}}},
	}}
	input := []formats.Record{{"postal_code": "78701-1234"}}

	_, err := Apply(spec, input, nil, ApplyOptions{})
	if err == nil {
		t.Fatal("expected substring config error")
	}
}

func TestApplyPreservesRepeatedValuesForTabularTargets(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{
			From:          "claim.codes.code",
			To:            "procedure_codes",
			JoinDelimiter: " | ",
			Transforms:    []Transform{},
		},
	}}
	input := []formats.Record{{
		"claim": map[string]any{
			"codes": map[string]any{
				"code": []any{"1", "2"},
			},
		},
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{TargetFormat: "csv"})
	if err != nil {
		t.Fatalf("apply preserve failed: %v", err)
	}

	value, _ := formats.GetPath(result.Records[0], "procedure_codes")
	if value != "1 | 2" {
		t.Fatalf("unexpected joined repeated value: %#v", value)
	}
}

func TestApplyExplodesRepeatedValuesIntoRows(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{From: "claim.name", To: "claimant_name", Transforms: []Transform{}},
		{
			From:       "claim.codes.code",
			To:         "procedure_code",
			RepeatMode: "explode",
			Transforms: []Transform{},
		},
	}}
	input := []formats.Record{{
		"claim": map[string]any{
			"name": "Bob",
			"codes": map[string]any{
				"code": []any{"1", "2"},
			},
		},
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{})
	if err != nil {
		t.Fatalf("apply explode failed: %v", err)
	}

	if len(result.Records) != 2 {
		t.Fatalf("expected 2 exploded rows, got %d", len(result.Records))
	}
	if result.Records[0]["procedure_code"] != "1" || result.Records[1]["procedure_code"] != "2" {
		t.Fatalf("unexpected exploded records: %#v", result.Records)
	}
	if result.Records[0]["claimant_name"] != "Bob" || result.Records[1]["claimant_name"] != "Bob" {
		t.Fatalf("expected scalar values to be copied across exploded rows: %#v", result.Records)
	}
}

func TestApplyUsesRowDriverPathToEmitOneRowPerBranchItem(t *testing.T) {
	spec := Spec{
		RowDriverPath: "claim.referral.services.service",
		Fields: []FieldMapping{
			{From: "claim.claimNumber", To: "claim_number", Transforms: []Transform{{Type: "trim"}}},
			{From: "claim.referral.services.service.lineNumber", To: "line_number", Transforms: []Transform{{Type: "trim"}}},
			{From: "claim.referral.services.service.procedureCode", To: "procedure_code", Transforms: []Transform{{Type: "trim"}}},
		},
	}
	input := []formats.Record{{
		"claim": map[string]any{
			"claimNumber": "CLM-100",
			"referral": map[string]any{
				"services": map[string]any{
					"service": []any{
						map[string]any{"lineNumber": "1", "procedureCode": "97153"},
						map[string]any{"lineNumber": "2", "procedureCode": "97155"},
					},
				},
			},
		},
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{TargetFormat: "csv"})
	if err != nil {
		t.Fatalf("apply row driver failed: %v", err)
	}

	if len(result.Records) != 2 {
		t.Fatalf("expected 2 row-driver records, got %d", len(result.Records))
	}
	if result.Records[0]["claim_number"] != "CLM-100" || result.Records[1]["claim_number"] != "CLM-100" {
		t.Fatalf("expected root scalar fields copied across row-driver output: %#v", result.Records)
	}
	if result.Records[0]["line_number"] != "1" || result.Records[1]["line_number"] != "2" {
		t.Fatalf("expected service line numbers to stay aligned per row: %#v", result.Records)
	}
	if result.Records[0]["procedure_code"] != "97153" || result.Records[1]["procedure_code"] != "97155" {
		t.Fatalf("expected service procedure codes to stay aligned per row: %#v", result.Records)
	}
}

func TestApplyRowDriverDisablesFieldLevelCartesianExplode(t *testing.T) {
	spec := Spec{
		RowDriverPath: "claim.referral.services.service",
		Fields: []FieldMapping{
			{From: "claim.referral.services.service.lineNumber", To: "line_number", Transforms: []Transform{{Type: "trim"}}},
			{
				From:          "claim.referral.services.service.modifiers.modifier",
				To:            "modifiers",
				RepeatMode:    "explode",
				JoinDelimiter: " | ",
				Transforms:    []Transform{},
			},
		},
	}
	input := []formats.Record{{
		"claim": map[string]any{
			"referral": map[string]any{
				"services": map[string]any{
					"service": []any{
						map[string]any{
							"lineNumber": "1",
							"modifiers": map[string]any{
								"modifier": []any{"A1", "B2"},
							},
						},
						map[string]any{
							"lineNumber": "2",
							"modifiers": map[string]any{
								"modifier": []any{"C3"},
							},
						},
					},
				},
			},
		},
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{TargetFormat: "csv"})
	if err != nil {
		t.Fatalf("apply row driver with nested array failed: %v", err)
	}

	if len(result.Records) != 2 {
		t.Fatalf("expected row-driver output count to stay at 2, got %d", len(result.Records))
	}
	if result.Records[0]["modifiers"] != "A1 | B2" || result.Records[1]["modifiers"] != "C3" {
		t.Fatalf("expected nested arrays to stay within each row-driver item: %#v", result.Records)
	}
}

func TestApplyReadsIndexedValuesFromRepeatedBranches(t *testing.T) {
	spec := Spec{Fields: []FieldMapping{
		{From: "claim.diagnoses.diagnosis[1].codeValue", To: "diagnosis_code_1", Transforms: []Transform{{Type: "trim"}}},
		{From: "claim.services.service[2].procedureCode", To: "procedure_code_2", Transforms: []Transform{{Type: "trim"}}},
	}}
	input := []formats.Record{{
		"claim": map[string]any{
			"diagnoses": map[string]any{
				"diagnosis": []any{
					map[string]any{"codeValue": "F84.0"},
					map[string]any{"codeValue": "E11.9"},
				},
			},
			"services": map[string]any{
				"service": []any{
					map[string]any{"procedureCode": "97153"},
					map[string]any{"procedureCode": "97155"},
				},
			},
		},
	}}

	result, err := Apply(spec, input, nil, ApplyOptions{})
	if err != nil {
		t.Fatalf("apply indexed values failed: %v", err)
	}

	if value, _ := formats.GetPath(result.Records[0], "diagnosis_code_1"); value != "F84.0" {
		t.Fatalf("unexpected indexed diagnosis value: %#v", value)
	}
	if value, _ := formats.GetPath(result.Records[0], "procedure_code_2"); value != "97155" {
		t.Fatalf("unexpected indexed procedure value: %#v", value)
	}
}
