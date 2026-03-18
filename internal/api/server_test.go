package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/mapping"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

func TestPreviewEndpoint(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	requestBody := map[string]any{
		"pipeline": pipeline.Definition{
			Pipeline: pipeline.Metadata{ID: "preview", Name: "Preview"},
			Source:   pipeline.ConnectorConfig{Type: "http", Format: "csv"},
			Target:   pipeline.ConnectorConfig{Type: "stdout", Format: "json"},
			Mapping: mapping.Spec{Fields: []mapping.FieldMapping{
				{Expression: `record.first_name + " " + record.last_name`, To: "customer.name", Transforms: []mapping.Transform{{Type: "trim"}}},
			}},
		},
		"samplePayload": "first_name,last_name\nAda,Lovelace\n",
	}
	payload, _ := json.Marshal(requestBody)

	request := httptest.NewRequest(http.MethodPost, "/api/mapping/preview", bytes.NewReader(payload))
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("customer")) {
		t.Fatalf("unexpected response: %s", response.Body.String())
	}
}
