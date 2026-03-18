package formats

import "context"

// Decoder converts raw bytes into canonical records.
type Decoder interface {
	// Decode parses input bytes and returns zero or more canonical records.
	Decode(ctx context.Context, payload []byte) ([]Record, error)
}

// Encoder converts canonical records into wire-format bytes.
type Encoder interface {
	// Encode serializes records into a target output format.
	Encode(ctx context.Context, records []Record) ([]byte, error)
}

// Metadata describes a supported format implementation.
type Metadata struct {
	Name        string   `json:"name"`
	Extensions  []string `json:"extensions,omitempty"`
	Description string   `json:"description,omitempty"`
}
