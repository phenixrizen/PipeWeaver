package connectors

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// Metadata exposes connector identity and runtime capabilities.
type Metadata struct {
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities,omitempty"`
}

// SourceConnector reads raw payloads from a configured upstream source.
type SourceConnector interface {
	Init(ctx context.Context, config pipeline.ConnectorConfig) error
	Read(ctx context.Context) ([]byte, error)
	Sample(ctx context.Context) ([]byte, error)
	Metadata() Metadata
}

// SinkConnector writes raw payloads to a configured destination.
type SinkConnector interface {
	Init(ctx context.Context, config pipeline.ConnectorConfig) error
	Write(ctx context.Context, payload []byte) error
	Metadata() Metadata
}

// NewSourceConnector creates a source connector from configuration.
func NewSourceConnector(config pipeline.ConnectorConfig) (SourceConnector, error) {
	var connector SourceConnector
	switch strings.ToLower(config.Type) {
	case "file":
		connector = &FileSource{}
	case "http":
		connector = &HTTPSource{}
	case "postgres":
		connector = &PostgresSource{}
	case "kafka":
		connector = &KafkaSource{}
	default:
		return nil, fmt.Errorf("unsupported source connector %q", config.Type)
	}
	return connector, connector.Init(context.Background(), config)
}

// NewSinkConnector creates a sink connector from configuration.
func NewSinkConnector(config pipeline.ConnectorConfig) (SinkConnector, error) {
	var connector SinkConnector
	switch strings.ToLower(config.Type) {
	case "file":
		connector = &FileSink{}
	case "stdout":
		connector = &StdoutSink{}
	case "postgres":
		connector = &PostgresSink{}
	case "kafka":
		connector = &KafkaSink{}
	default:
		return nil, fmt.Errorf("unsupported sink connector %q", config.Type)
	}
	return connector, connector.Init(context.Background(), config)
}

// configString safely reads a string value from a connector configuration map.
func configString(config map[string]any, key string) string {
	value, _ := config[key].(string)
	return value
}

// configFileContents allows test requests to inline file payloads without creating temporary fixtures.
func configFileContents(path string) ([]byte, error) {
	return os.ReadFile(path)
}
