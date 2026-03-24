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

func TestHTTPPipelineEndpointReplyMode(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	definition := pipeline.Definition{
		Pipeline: pipeline.Metadata{ID: "reply-flow", Name: "Reply flow"},
		Source:   pipeline.ConnectorConfig{Type: "http", Format: "csv"},
		Target: pipeline.ConnectorConfig{
			Type:   "stdout",
			Format: "json",
			Config: map[string]any{"responseMode": "reply"},
		},
		Mapping: mapping.Spec{Fields: []mapping.FieldMapping{
			{From: "customer_id", To: "customer.id", Transforms: []mapping.Transform{{Type: "trim"}}},
		}},
	}

	if err := server.store.Save(definition); err != nil {
		t.Fatalf("save pipeline failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/http/reply-flow", bytes.NewBufferString("customer_id\n1001\n"))
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("unexpected content type: %s", got)
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"customer"`)) {
		t.Fatalf("expected raw transformed payload, got %s", response.Body.String())
	}
}

func TestHTTPPipelineEndpointPreviewEnvelope(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	definition := pipeline.Definition{
		Pipeline: pipeline.Metadata{ID: "preview-flow", Name: "Preview flow"},
		Source:   pipeline.ConnectorConfig{Type: "http", Format: "csv"},
		Target: pipeline.ConnectorConfig{
			Type:   "stdout",
			Format: "json",
			Config: map[string]any{"responseMode": "preview"},
		},
		Mapping: mapping.Spec{Fields: []mapping.FieldMapping{
			{From: "customer_id", To: "customer.id", Transforms: []mapping.Transform{{Type: "trim"}}},
		}},
	}

	if err := server.store.Save(definition); err != nil {
		t.Fatalf("save pipeline failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/http/preview-flow", bytes.NewBufferString("customer_id\n1001\n"))
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"encodedOutput"`)) {
		t.Fatalf("expected preview envelope, got %s", response.Body.String())
	}
}

func TestDeletePipelineEndpointRemovesStoredPipeline(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	definition := pipeline.Definition{
		Pipeline: pipeline.Metadata{ID: "delete-flow", Name: "Delete flow"},
		Source:   pipeline.ConnectorConfig{Type: "http", Format: "csv"},
		Target:   pipeline.ConnectorConfig{Type: "stdout", Format: "json"},
	}
	if err := server.store.Save(definition); err != nil {
		t.Fatalf("save pipeline failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodDelete, "/api/pipelines/delete-flow", nil)
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	if _, err := server.store.Get("delete-flow"); err == nil {
		t.Fatal("expected pipeline to be removed from the store")
	}
}

func TestDeleteMissingPipelineReturnsNotFound(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodDelete, "/api/pipelines/missing", nil)
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
}

func TestOptionsRequestsReturnCORSHeaders(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodOptions, "/api/mapping/preview", nil)
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("unexpected allow origin header: %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Methods"); got != "GET,POST,DELETE,OPTIONS" {
		t.Fatalf("unexpected allow methods header: %q", got)
	}
}

func TestUnsupportedMethodsReturnMethodNotAllowed(t *testing.T) {
	server, err := NewServer(t.TempDir())
	if err != nil {
		t.Fatalf("new server failed: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/mapping/preview", nil)
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
}
