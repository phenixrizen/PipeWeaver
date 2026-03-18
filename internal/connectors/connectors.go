package connectors

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// Metadata provides connector-level descriptive information.
type Metadata struct {
	Name         string         `json:"name"`
	Type         string         `json:"type"`
	Capabilities []string       `json:"capabilities,omitempty"`
	Config       map[string]any `json:"config,omitempty"`
}

// SourceConnector reads raw payload bytes that will be decoded later.
type SourceConnector interface {
	Initialize(ctx context.Context, config pipeline.ConnectorConfig) error
	Read(ctx context.Context) ([]byte, error)
	Sample(ctx context.Context) ([]byte, error)
	Metadata() Metadata
}

// SinkConnector writes encoded payload bytes.
type SinkConnector interface {
	Initialize(ctx context.Context, config pipeline.ConnectorConfig) error
	Write(ctx context.Context, payload []byte, records []formats.Record) error
	Metadata() Metadata
}

// NewSource constructs a source connector from pipeline configuration.
func NewSource(config pipeline.ConnectorConfig) (SourceConnector, error) {
	var connector SourceConnector
	switch strings.ToLower(config.Type) {
	case "http":
		connector = &HTTPSource{}
	case "file":
		connector = &FileSource{}
	case "postgres", "postgresql", "sql":
		connector = &PostgresSource{}
	case "kafka":
		connector = &KafkaSource{}
	default:
		return nil, fmt.Errorf("unsupported source connector %q", config.Type)
	}
	if err := connector.Initialize(context.Background(), config); err != nil {
		return nil, err
	}
	return connector, nil
}

// NewSink constructs a sink connector from pipeline configuration.
func NewSink(config pipeline.ConnectorConfig) (SinkConnector, error) {
	var connector SinkConnector
	switch strings.ToLower(config.Type) {
	case "stdout":
		connector = &StdoutSink{}
	case "file":
		connector = &FileSink{}
	case "postgres", "postgresql", "sql":
		connector = &PostgresSink{}
	case "kafka":
		connector = &KafkaSink{}
	default:
		return nil, fmt.Errorf("unsupported sink connector %q", config.Type)
	}
	if err := connector.Initialize(context.Background(), config); err != nil {
		return nil, err
	}
	return connector, nil
}

// FileSource reads payload bytes from disk for local execution and tests.
type FileSource struct{ path string }

func (s *FileSource) Initialize(_ context.Context, config pipeline.ConnectorConfig) error {
	path, _ := config.Config["path"].(string)
	if path == "" {
		return fmt.Errorf("file source path is required")
	}
	s.path = path
	return nil
}
func (s *FileSource) Read(_ context.Context) ([]byte, error)     { return os.ReadFile(s.path) }
func (s *FileSource) Sample(ctx context.Context) ([]byte, error) { return s.Read(ctx) }
func (s *FileSource) Metadata() Metadata {
	return Metadata{Name: filepath.Base(s.path), Type: "file", Capabilities: []string{"read", "sample"}}
}

// HTTPSource stores sample HTTP request bodies for pipeline testing and future live ingestion.
type HTTPSource struct{ sample string }

func (s *HTTPSource) Initialize(_ context.Context, config pipeline.ConnectorConfig) error {
	if sample, ok := config.Config["samplePayload"].(string); ok {
		s.sample = sample
	}
	return nil
}
func (s *HTTPSource) Read(_ context.Context) ([]byte, error)   { return []byte(s.sample), nil }
func (s *HTTPSource) Sample(_ context.Context) ([]byte, error) { return []byte(s.sample), nil }
func (s *HTTPSource) Metadata() Metadata {
	return Metadata{Name: "http-ingest", Type: "http", Capabilities: []string{"sample", "ingest-hook"}}
}

// StdoutSink prints encoded output for local CLI execution.
type StdoutSink struct{}

func (s *StdoutSink) Initialize(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }
func (s *StdoutSink) Write(_ context.Context, payload []byte, _ []formats.Record) error {
	_, err := fmt.Fprintln(os.Stdout, string(payload))
	return err
}
func (s *StdoutSink) Metadata() Metadata {
	return Metadata{Name: "stdout", Type: "stdout", Capabilities: []string{"write"}}
}

// FileSink persists encoded output to disk.
type FileSink struct{ path string }

func (s *FileSink) Initialize(_ context.Context, config pipeline.ConnectorConfig) error {
	path, _ := config.Config["path"].(string)
	if path == "" {
		return fmt.Errorf("file sink path is required")
	}
	s.path = path
	return nil
}
func (s *FileSink) Write(_ context.Context, payload []byte, _ []formats.Record) error {
	return os.WriteFile(s.path, payload, 0o644)
}
func (s *FileSink) Metadata() Metadata {
	return Metadata{Name: filepath.Base(s.path), Type: "file", Capabilities: []string{"write"}}
}

// PostgresSource is a scaffold for future SQL extraction support.
type PostgresSource struct{}

func (s *PostgresSource) Initialize(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }
func (s *PostgresSource) Read(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("postgres source scaffold not implemented yet")
}
func (s *PostgresSource) Sample(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("postgres source sample scaffold not implemented yet")
}
func (s *PostgresSource) Metadata() Metadata {
	return Metadata{Name: "postgres-source", Type: "postgres", Capabilities: []string{"scaffold"}}
}

// PostgresSink is a scaffold for future SQL loading support.
type PostgresSink struct{}

func (s *PostgresSink) Initialize(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }
func (s *PostgresSink) Write(_ context.Context, _ []byte, _ []formats.Record) error {
	return fmt.Errorf("postgres sink scaffold not implemented yet")
}
func (s *PostgresSink) Metadata() Metadata {
	return Metadata{Name: "postgres-sink", Type: "postgres", Capabilities: []string{"scaffold"}}
}

// KafkaSource is a scaffold for future streaming ingestion support.
type KafkaSource struct{}

func (s *KafkaSource) Initialize(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }
func (s *KafkaSource) Read(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("kafka source scaffold not implemented yet")
}
func (s *KafkaSource) Sample(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("kafka source sample scaffold not implemented yet")
}
func (s *KafkaSource) Metadata() Metadata {
	return Metadata{Name: "kafka-source", Type: "kafka", Capabilities: []string{"scaffold"}}
}

// KafkaSink is a scaffold for future streaming emission support.
type KafkaSink struct{}

func (s *KafkaSink) Initialize(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }
func (s *KafkaSink) Write(_ context.Context, _ []byte, _ []formats.Record) error {
	return fmt.Errorf("kafka sink scaffold not implemented yet")
}
func (s *KafkaSink) Metadata() Metadata {
	return Metadata{Name: "kafka-sink", Type: "kafka", Capabilities: []string{"scaffold"}}
}
