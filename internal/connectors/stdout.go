package connectors

import (
	"context"
	"fmt"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// StdoutSink prints encoded payloads to the terminal for local testing.
type StdoutSink struct{}

// Init does not require any configuration.
func (sink *StdoutSink) Init(_ context.Context, _ pipeline.ConnectorConfig) error {
	return nil
}

// Write prints the payload directly to stdout.
func (sink *StdoutSink) Write(_ context.Context, payload []byte) error {
	_, err := fmt.Println(string(payload))
	return err
}

// Metadata returns connector metadata.
func (sink *StdoutSink) Metadata() Metadata {
	return Metadata{Name: "stdout", Capabilities: []string{"write"}}
}
