package mapping

import (
	"context"
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
)

// TestMapRecord validates ordered transforms and target path writes.
func TestMapRecord(t *testing.T) {
	engine := Engine{TargetSchema: &schema.Definition{Fields: []schema.Field{{Path: "customer.name", Type: schema.TypeString, Required: true}}}}
	result, err := engine.MapRecord(context.Background(), Definition{Fields: []FieldMapping{{
		From:       "full_name",
		To:         "customer.name",
		Transforms: []Transform{{Type: "trim"}, {Type: "upper"}},
	}}}, formats.Record{"full_name": " alice "})
	if err != nil {
		t.Fatalf("map record: %v", err)
	}
	value, _ := formats.GetPath(result.Record, "customer.name")
	if value != "ALICE" {
		t.Fatalf("unexpected mapped value: %v", value)
	}
	if len(result.ValidationErrors) != 0 {
		t.Fatalf("unexpected validation errors: %#v", result.ValidationErrors)
	}
}

// TestDefaultTransform validates transform behavior when source fields are missing.
func TestDefaultTransform(t *testing.T) {
	engine := Engine{}
	result, err := engine.MapRecord(context.Background(), Definition{Fields: []FieldMapping{{
		To:         "invoice.currency",
		Transforms: []Transform{{Type: "default", Value: "USD"}},
	}}}, formats.Record{})
	if err != nil {
		t.Fatalf("map record: %v", err)
	}
	value, _ := formats.GetPath(result.Record, "invoice.currency")
	if value != "USD" {
		t.Fatalf("unexpected default value: %v", value)
	}
}
