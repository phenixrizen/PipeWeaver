package schema

import (
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
)

// TestValidate checks required and type-aware validation behavior.
func TestValidate(t *testing.T) {
	definition := &Definition{Fields: []Field{{Path: "customer.id", Type: TypeString, Required: true}}}
	errors := Validate(definition, formats.Record{"customer": map[string]any{"id": 1001}})
	if len(errors) != 1 {
		t.Fatalf("expected one validation error, got %#v", errors)
	}
}

// TestInferDefinition checks schema inference from canonical records.
func TestInferDefinition(t *testing.T) {
	definition := InferDefinition("demo", "json", []formats.Record{{"amount": "42.0", "customer": map[string]any{"name": "Alice"}}})
	if len(definition.Fields) == 0 {
		t.Fatal("expected inferred fields")
	}
}
