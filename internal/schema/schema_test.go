package schema

import (
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
)

func TestValidateRecord(t *testing.T) {
	definition := Definition{
		Type: TypeObject,
		Fields: []Field{
			{Name: "customer", Type: TypeObject, Required: true, Fields: []Field{{Name: "id", Type: TypeString, Required: true}}},
		},
	}

	record := formats.Record{"customer": map[string]any{"id": "123"}}
	errors := ValidateRecord(definition, record)
	if len(errors) != 0 {
		t.Fatalf("expected no errors, got %#v", errors)
	}

	record = formats.Record{"customer": map[string]any{}}
	errors = ValidateRecord(definition, record)
	if len(errors) == 0 {
		t.Fatal("expected validation errors")
	}
}

func TestInferFromRecordsBuildsNestedFields(t *testing.T) {
	definition := InferFromRecords([]formats.Record{
		{
			"customer": map[string]any{
				"id":   "123",
				"name": "Ada",
			},
			"invoice": map[string]any{
				"amount":  12.5,
				"paid":    true,
				"line_id": 2,
			},
		},
	})

	if definition.Type != TypeObject {
		t.Fatalf("unexpected definition type: %s", definition.Type)
	}
	if len(definition.Fields) != 2 {
		t.Fatalf("expected 2 top-level fields, got %#v", definition.Fields)
	}

	customer := definition.Fields[0]
	if customer.Name != "customer" || customer.Type != TypeObject {
		t.Fatalf("unexpected customer field: %#v", customer)
	}
	if len(customer.Fields) != 2 {
		t.Fatalf("expected nested customer fields, got %#v", customer.Fields)
	}

	invoice := definition.Fields[1]
	if invoice.Name != "invoice" || invoice.Type != TypeObject {
		t.Fatalf("unexpected invoice field: %#v", invoice)
	}
	if len(invoice.Fields) != 3 {
		t.Fatalf("expected nested invoice fields, got %#v", invoice.Fields)
	}
}

func TestValidateRecordAcceptsArrayFields(t *testing.T) {
	definition := Definition{
		Type: TypeObject,
		Fields: []Field{
			{
				Name:     "codes",
				Type:     TypeArray,
				Required: true,
			},
		},
	}

	record := formats.Record{"codes": []any{"1", "2"}}
	errors := ValidateRecord(definition, record)
	if len(errors) != 0 {
		t.Fatalf("expected no array validation errors, got %#v", errors)
	}
}

func TestInferFromRecordsBuildsArrayFields(t *testing.T) {
	definition := InferFromRecords([]formats.Record{
		{
			"claim": map[string]any{
				"codes": map[string]any{
					"code": []any{"1", "2"},
				},
			},
		},
	})

	if len(definition.Fields) != 1 || definition.Fields[0].Name != "claim" {
		t.Fatalf("unexpected definition fields: %#v", definition.Fields)
	}

	codesField := definition.Fields[0].Fields[0]
	if codesField.Name != "codes" || codesField.Type != TypeObject {
		t.Fatalf("unexpected codes field: %#v", codesField)
	}

	codeField := codesField.Fields[0]
	if codeField.Name != "code" || codeField.Type != TypeArray {
		t.Fatalf("expected repeated code field to infer as array, got %#v", codeField)
	}
}
