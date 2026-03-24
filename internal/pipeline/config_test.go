package pipeline

import (
	"strings"
	"testing"
)

func TestParsePreservesAIContext(t *testing.T) {
	definition, err := Parse([]byte(`{
  "pipeline": {
    "id": "claim",
    "name": "Claim",
    "aiContext": "One output row is one diagnosis line."
  },
  "source": {"type": "http", "format": "json"},
  "target": {"type": "stdout", "format": "csv"},
  "mapping": {"fields": []}
}`))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	if definition.Pipeline.AIContext != "One output row is one diagnosis line." {
		t.Fatalf("expected aiContext to round-trip through parse, got %q", definition.Pipeline.AIContext)
	}
}

func TestMarshalIncludesAIContextWhenPresent(t *testing.T) {
	payload, err := Marshal(Definition{
		Pipeline: Metadata{
			ID:        "claim",
			Name:      "Claim",
			AIContext: "NPI is provider ID.",
		},
		Source: ConnectorConfig{Type: "http", Format: "json"},
		Target: ConnectorConfig{Type: "stdout", Format: "csv"},
	}, "claim.json")
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	if !strings.Contains(string(payload), `"aiContext": "NPI is provider ID."`) {
		t.Fatalf("expected aiContext in marshaled payload, got %s", string(payload))
	}
}
