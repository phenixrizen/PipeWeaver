package connectors

import (
	"context"
	"fmt"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// PostgresSource is a scaffold for future SQL reads.
type PostgresSource struct{}

// Init acknowledges configuration while full SQL support is still pending.
func (source *PostgresSource) Init(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }

// Read returns a descriptive scaffold error until SQL support is implemented.
func (source *PostgresSource) Read(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("postgres source scaffold: not implemented yet")
}

// Sample returns the same scaffold error to keep behavior explicit.
func (source *PostgresSource) Sample(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("postgres source scaffold: not implemented yet")
}

// Metadata describes the scaffolded connector.
func (source *PostgresSource) Metadata() Metadata {
	return Metadata{Name: "postgres", Capabilities: []string{"scaffold"}}
}

// PostgresSink is a scaffold for future SQL writes.
type PostgresSink struct{}

// Init acknowledges configuration while full SQL support is still pending.
func (sink *PostgresSink) Init(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }

// Write returns a descriptive scaffold error until SQL support is implemented.
func (sink *PostgresSink) Write(_ context.Context, _ []byte) error {
	return fmt.Errorf("postgres sink scaffold: not implemented yet")
}

// Metadata describes the scaffolded connector.
func (sink *PostgresSink) Metadata() Metadata {
	return Metadata{Name: "postgres", Capabilities: []string{"scaffold"}}
}

// KafkaSource is a scaffold for future stream ingestion.
type KafkaSource struct{}

// Init acknowledges configuration while full Kafka support is still pending.
func (source *KafkaSource) Init(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }

// Read returns a descriptive scaffold error until Kafka support is implemented.
func (source *KafkaSource) Read(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("kafka source scaffold: not implemented yet")
}

// Sample returns the same scaffold error to keep behavior explicit.
func (source *KafkaSource) Sample(_ context.Context) ([]byte, error) {
	return nil, fmt.Errorf("kafka source scaffold: not implemented yet")
}

// Metadata describes the scaffolded connector.
func (source *KafkaSource) Metadata() Metadata {
	return Metadata{Name: "kafka", Capabilities: []string{"scaffold"}}
}

// KafkaSink is a scaffold for future stream emission.
type KafkaSink struct{}

// Init acknowledges configuration while full Kafka support is still pending.
func (sink *KafkaSink) Init(_ context.Context, _ pipeline.ConnectorConfig) error { return nil }

// Write returns a descriptive scaffold error until Kafka support is implemented.
func (sink *KafkaSink) Write(_ context.Context, _ []byte) error {
	return fmt.Errorf("kafka sink scaffold: not implemented yet")
}

// Metadata describes the scaffolded connector.
func (sink *KafkaSink) Metadata() Metadata {
	return Metadata{Name: "kafka", Capabilities: []string{"scaffold"}}
}
