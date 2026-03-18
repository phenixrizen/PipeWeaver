package formats

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"sort"
)

// DelimitedDecoder parses CSV-like formats with a configurable delimiter and header row.
type DelimitedDecoder struct {
	Delimiter rune
}

// Decode parses header-based delimited text into records.
func (decoder DelimitedDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	reader := csv.NewReader(bytes.NewReader(payload))
	reader.Comma = decoder.Delimiter
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("decode delimited: %w", err)
	}
	if len(rows) == 0 {
		return []Record{}, nil
	}

	headers := rows[0]
	records := make([]Record, 0, max(0, len(rows)-1))
	for _, row := range rows[1:] {
		record := Record{}
		for index, header := range headers {
			if index < len(row) {
				record[header] = row[index]
			} else {
				record[header] = ""
			}
		}
		records = append(records, record)
	}
	return records, nil
}

// DelimitedEncoder writes records into a header-based delimited output.
type DelimitedEncoder struct {
	Delimiter rune
}

// Encode serializes canonical records into delimited text.
func (encoder DelimitedEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	writer.Comma = encoder.Delimiter

	headers := collectHeaders(records)
	if err := writer.Write(headers); err != nil {
		return nil, fmt.Errorf("write headers: %w", err)
	}

	for _, record := range records {
		row := make([]string, 0, len(headers))
		for _, header := range headers {
			value, _ := GetPath(record, header)
			row = append(row, fmt.Sprint(value))
		}
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("write row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("flush writer: %w", err)
	}
	return buffer.Bytes(), nil
}

// collectHeaders gathers top-level and nested keys from records to produce a stable output table.
func collectHeaders(records []Record) []string {
	set := map[string]struct{}{}
	for _, record := range records {
		flattenRecord("", record, set)
	}
	headers := make([]string, 0, len(set))
	for header := range set {
		headers = append(headers, header)
	}
	sort.Strings(headers)
	return headers
}

// flattenRecord recursively expands nested objects into dot-path headers.
func flattenRecord(prefix string, value any, set map[string]struct{}) {
	switch typed := value.(type) {
	case Record:
		for key, nested := range typed {
			next := key
			if prefix != "" {
				next = prefix + "." + key
			}
			flattenRecord(next, nested, set)
		}
	case map[string]any:
		for key, nested := range typed {
			next := key
			if prefix != "" {
				next = prefix + "." + key
			}
			flattenRecord(next, nested, set)
		}
	default:
		if prefix != "" {
			set[prefix] = struct{}{}
		}
	}
}
