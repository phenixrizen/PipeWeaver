package formats

import (
	"context"
	"encoding/json"
	"fmt"
)

// JSONDecoder decodes JSON objects or arrays into canonical records.
type JSONDecoder struct{}

// Decode converts JSON payloads into one or more canonical records.
func (d JSONDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	var value any
	if err := json.Unmarshal(payload, &value); err != nil {
		return nil, fmt.Errorf("decode json: %w", err)
	}

	switch typed := value.(type) {
	case []any:
		records := make([]Record, 0, len(typed))
		for _, item := range typed {
			mapped, ok := item.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("json array contains non-object item")
			}
			records = append(records, Record(mapped))
		}
		return records, nil
	case map[string]any:
		return []Record{Record(typed)}, nil
	default:
		return nil, fmt.Errorf("json payload must be an object or array of objects")
	}
}

// JSONEncoder encodes canonical records into compact JSON.
type JSONEncoder struct{}

// Encode converts records into JSON while preserving the distinction between one record and many records.
func (e JSONEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	if len(records) == 1 {
		return json.MarshalIndent(records[0], "", "  ")
	}

	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any(record))
	}
	return json.MarshalIndent(items, "", "  ")
}
