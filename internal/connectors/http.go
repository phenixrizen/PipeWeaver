package connectors

import (
	"context"
	"fmt"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// HTTPSource acts as a placeholder for HTTP-ingested payloads handled by the API runtime.
type HTTPSource struct {
	samplePayload []byte
}

// Init captures an optional inline sample body used by previews and tests.
func (source *HTTPSource) Init(_ context.Context, config pipeline.ConnectorConfig) error {
	if body := configString(config.Config, "samplePayload"); body != "" {
		source.samplePayload = []byte(body)
	}
	return nil
}

// Read is intentionally unsupported because the API injects request bodies directly at runtime.
func (source *HTTPSource) Read(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("http source reads are provided by the API request body")
}

// Sample returns an inline sample body when one is configured.
func (source *HTTPSource) Sample(_ context.Context) ([]byte, error) {
	return source.samplePayload, nil
}

// Metadata returns connector metadata.
func (source *HTTPSource) Metadata() Metadata {
	return Metadata{Name: "http", Capabilities: []string{"sample", "ingest-via-api"}}
}
