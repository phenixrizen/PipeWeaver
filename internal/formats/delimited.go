package formats

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"
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
	Delimiter  rune
	Columns    []DelimitedColumn
	NilAsEmpty bool
}

// DelimitedColumn describes the record key and emitted header for a tabular output column.
type DelimitedColumn struct {
	Key    string
	Header string
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

	keys, headers := orderedDelimitedColumns(records, e.Columns)
	if err := writer.Write(headers); err != nil {
		return nil, fmt.Errorf("write headers: %w", err)
	}

	for _, record := range records {
		row := make([]string, 0, len(keys))
		for _, key := range keys {
			row = append(row, stringifyDelimitedValue(record[key], e.NilAsEmpty))
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

func orderedDelimitedColumns(records []Record, configured []DelimitedColumn) ([]string, []string) {
	if len(configured) == 0 {
		keys := orderedKeys(records)
		return keys, keys
	}

	keys := make([]string, 0, len(configured))
	headers := make([]string, 0, len(configured))
	seen := make(map[string]bool, len(configured))

	for _, column := range configured {
		key := column.Key
		if key == "" {
			key = column.Header
		}
		if key == "" || seen[key] {
			continue
		}
		header := column.Header
		if header == "" {
			header = key
		}
		seen[key] = true
		keys = append(keys, key)
		headers = append(headers, header)
	}

	for _, key := range orderedKeys(records) {
		if seen[key] {
			continue
		}
		keys = append(keys, key)
		headers = append(headers, key)
	}

	return keys, headers
}

func stringifyDelimitedValue(value any, nilAsEmpty bool) string {
	if value == nil {
		if nilAsEmpty {
			return ""
		}
		return fmt.Sprint(value)
	}

	items, ok := value.([]any)
	if !ok {
		return fmt.Sprint(value)
	}

	row := make([]string, 0, len(items))
	for _, item := range items {
		if item == nil && nilAsEmpty {
			row = append(row, "")
			continue
		}
		row = append(row, fmt.Sprint(item))
	}
	return strings.Join(row, ", ")
}
