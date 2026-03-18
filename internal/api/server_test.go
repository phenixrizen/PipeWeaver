package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/store"
)

// TestPreviewEndpoint verifies that ad-hoc preview execution returns transformed output.
func TestPreviewEndpoint(t *testing.T) {
	tempDir := t.TempDir()
	server := Server{Store: store.FilesystemStore{Root: tempDir}}
	body := []byte(`{"pipeline":{"id":"preview-demo","name":"Preview demo","source":{"type":"http","format":"json"},"target":{"type":"stdout","format":"json"},"mapping":{"fields":[{"from":"name","to":"customer.name","transforms":[{"type":"trim"}]}]}},"input":"{\"name\":\" Alice \"}"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/mapping/preview", bytes.NewReader(body))
	response := httptest.NewRecorder()

	server.NewMux().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result["output"] == nil {
		t.Fatalf("expected preview output, got %#v", result)
	}
}
