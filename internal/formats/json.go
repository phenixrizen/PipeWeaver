package formats

import (
	"context"
	"encoding/json"
	"fmt"
)

// JSONDecoder parses JSON arrays, objects, and primitive envelopes into canonical records.
type JSONDecoder struct{}

// Decode converts JSON bytes into records.
func (JSONDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	var raw any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("decode json: %w", err)
	}

	switch typed := raw.(type) {
	case []any:
		records := make([]Record, 0, len(typed))
		for _, item := range typed {
			converted, err := normalizeRecord(item)
			if err != nil {
				return nil, err
			}
			records = append(records, converted)
		}
		return records, nil
	default:
		record, err := normalizeRecord(typed)
		if err != nil {
			return nil, err
		}
		return []Record{record}, nil
	}
}

// JSONEncoder writes one or many records as indented JSON.
type JSONEncoder struct{}

// Encode serializes records into JSON.
func (JSONEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	if len(records) == 1 {
		return json.MarshalIndent(records[0], "", "  ")
	}
	return json.MarshalIndent(records, "", "  ")
}

// normalizeRecord ensures every decoded JSON item can be handled by the mapping engine.
func normalizeRecord(value any) (Record, error) {
	switch typed := value.(type) {
	case map[string]any:
		return Record(typed), nil
	case Record:
		return typed, nil
	default:
		return Record{"value": typed}, nil
	}
}
