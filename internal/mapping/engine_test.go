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

	result, err := Apply(spec, input, targetSchema)
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

	result, err := Apply(spec, input, nil)
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
