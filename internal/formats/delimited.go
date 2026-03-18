package formats

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
)

// DelimitedDecoder reads CSV-like formats with a configurable delimiter and header row handling.
type DelimitedDecoder struct {
	Delimiter rune
}

// Decode parses delimited text into canonical records keyed by header names.
func (d DelimitedDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	reader := csv.NewReader(bytes.NewReader(payload))
	reader.Comma = d.Delimiter
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("decode delimited: %w", err)
	}
	if len(rows) == 0 {
		return []Record{}, nil
	}

	headers := rows[0]
	records := make([]Record, 0, len(rows)-1)
	for _, row := range rows[1:] {
		record := Record{}
		for idx, header := range headers {
			if idx < len(row) {
				record[header] = row[idx]
			}
		}
		records = append(records, record)
	}
	return records, nil
}

// DelimitedEncoder writes canonical records using a configurable delimiter.
type DelimitedEncoder struct {
	Delimiter rune
}

// Encode flattens top-level keys into a delimited table. Nested objects are stringified using fmt.Sprint.
func (e DelimitedEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	writer.Comma = e.Delimiter

	if len(records) == 0 {
		writer.Flush()
		return buffer.Bytes(), writer.Error()
	}

	headers := orderedKeys(records)
	if err := writer.Write(headers); err != nil {
		return nil, fmt.Errorf("write headers: %w", err)
	}

	for _, record := range records {
		row := make([]string, 0, len(headers))
		for _, header := range headers {
			row = append(row, fmt.Sprint(record[header]))
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("write row: %w", err)
		}
	}

	writer.Flush()
	return buffer.Bytes(), writer.Error()
}

func orderedKeys(records []Record) []string {
	seen := map[string]bool{}
	keys := make([]string, 0)
	for _, record := range records {
		for key := range record {
			if seen[key] {
				continue
			}
			seen[key] = true
			keys = append(keys, key)
		}
	}
	return keys
}
