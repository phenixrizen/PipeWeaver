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
