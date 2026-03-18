package connectors

import (
	"context"
	"fmt"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// FileSource reads bytes from a local file.
type FileSource struct {
	path string
}

// Init configures the source path.
func (source *FileSource) Init(_ context.Context, config pipeline.ConnectorConfig) error {
	source.path = configString(config.Config, "path")
	if source.path == "" {
		return fmt.Errorf("file source path is required")
	}
	return nil
}

// Read loads the configured file into memory.
func (source *FileSource) Read(_ context.Context) ([]byte, error) {
	return os.ReadFile(source.path)
}

// Sample reuses the same file payload for previews.
func (source *FileSource) Sample(ctx context.Context) ([]byte, error) {
	return source.Read(ctx)
}

// Metadata returns connector metadata.
func (source *FileSource) Metadata() Metadata {
	return Metadata{Name: "file", Capabilities: []string{"read", "sample"}}
}

// FileSink writes output bytes to a local file.
type FileSink struct {
	path string
}

// Init configures the sink path.
func (sink *FileSink) Init(_ context.Context, config pipeline.ConnectorConfig) error {
	sink.path = configString(config.Config, "path")
	if sink.path == "" {
		return fmt.Errorf("file sink path is required")
	}
	return nil
}

// Write saves bytes to the configured file.
func (sink *FileSink) Write(_ context.Context, payload []byte) error {
	return os.WriteFile(sink.path, payload, 0o644)
}

// Metadata returns connector metadata.
func (sink *FileSink) Metadata() Metadata {
	return Metadata{Name: "file", Capabilities: []string{"write"}}
}
