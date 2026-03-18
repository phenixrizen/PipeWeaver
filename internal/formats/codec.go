package formats

import "context"

// Decoder converts raw bytes from a connector into canonical records.
type Decoder interface {
	Decode(ctx context.Context, payload []byte) ([]Record, error)
}

// Encoder converts canonical records into bytes suitable for a sink connector.
type Encoder interface {
	Encode(ctx context.Context, records []Record) ([]byte, error)
}
