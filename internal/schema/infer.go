package schema

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
)

// InferFromRecords creates a lightweight internal schema from canonical records.
func InferFromRecords(records []formats.Record) Definition {
	definition := Definition{Type: TypeObject, Fields: []Field{}}
	if len(records) == 0 {
		return definition
	}

	fieldTypes := map[string]Type{}
	for _, record := range records {
		for key, value := range record {
			fieldTypes[key] = inferType(value)
		}
	}

	for key, fieldType := range fieldTypes {
		definition.Fields = append(definition.Fields, Field{Name: key, Type: fieldType})
	}
	return definition
}

// InferFromDelimitedHeaders creates a schema from column names for CSV-like inputs.
func InferFromDelimitedHeaders(headers []string) Definition {
	definition := Definition{Type: TypeObject, Fields: []Field{}}
	for idx, header := range headers {
		index := idx
		definition.Fields = append(definition.Fields, Field{Name: header, Type: TypeString, Column: header, Index: &index})
	}
	return definition
}

func inferType(value any) Type {
	switch typed := value.(type) {
	case bool:
		return TypeBoolean
	case float64, float32:
		return TypeNumber
	case int, int64, int32:
		return TypeInteger
	case map[string]any, formats.Record:
		return TypeObject
	case []any:
		return TypeArray
	case string:
		if _, err := strconv.Atoi(typed); err == nil {
			return TypeInteger
		}
		if _, err := strconv.ParseFloat(typed, 64); err == nil && strings.Contains(typed, ".") {
			return TypeNumber
		}
		if strings.EqualFold(typed, "true") || strings.EqualFold(typed, "false") {
			return TypeBoolean
		}
		return TypeString
	default:
		_ = fmt.Sprintf("%T", typed)
		return TypeString
	}
}
