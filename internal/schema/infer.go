package schema

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
)

// InferDefinition builds a lightweight schema from a set of canonical records.
func InferDefinition(name, format string, records []formats.Record) *Definition {
	fieldMap := map[string]Field{}
	for _, record := range records {
		inferRecordFields("", record, fieldMap)
	}

	fields := make([]Field, 0, len(fieldMap))
	for _, field := range fieldMap {
		fields = append(fields, field)
	}
	sort.Slice(fields, func(i, j int) bool {
		return fields[i].Path < fields[j].Path
	})

	return &Definition{Name: name, Format: format, Fields: fields}
}

// inferRecordFields walks a record recursively and creates flat field definitions keyed by canonical path.
func inferRecordFields(prefix string, record formats.Record, fieldMap map[string]Field) {
	for key, value := range record {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}

		field := Field{Name: key, Path: path, Type: inferType(value)}
		if _, ok := fieldMap[path]; !ok {
			fieldMap[path] = field
		}

		switch typed := value.(type) {
		case formats.Record:
			inferRecordFields(path, typed, fieldMap)
		case map[string]any:
			inferRecordFields(path, formats.Record(typed), fieldMap)
		}
	}
}

// inferType infers simple scalar types, with string numeric detection improving delimited sources.
func inferType(value any) Type {
	switch typed := value.(type) {
	case bool:
		return TypeBoolean
	case int, int32, int64:
		return TypeInteger
	case float32, float64:
		return TypeNumber
	case formats.Record, map[string]any:
		return TypeObject
	case []any:
		return TypeArray
	case string:
		if _, err := strconv.Atoi(typed); err == nil {
			return TypeInteger
		}
		if _, err := strconv.ParseFloat(typed, 64); err == nil {
			return TypeNumber
		}
		if typed == "true" || typed == "false" {
			return TypeBoolean
		}
		return TypeString
	default:
		_ = fmt.Sprint(typed)
		return TypeString
	}
}
