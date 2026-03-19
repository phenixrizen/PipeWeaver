package schema

import (
	"fmt"
	"sort"
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

	for _, record := range records {
		definition.Fields = mergeObjectFields(definition.Fields, map[string]any(record))
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

func mergeObjectFields(existing []Field, source map[string]any) []Field {
	if len(source) == 0 {
		return existing
	}

	indexByName := make(map[string]int, len(existing))
	for index, field := range existing {
		indexByName[field.Name] = index
	}

	keys := make([]string, 0, len(source))
	for key := range source {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		nextField := inferField(key, source[key])
		existingIndex, exists := indexByName[key]
		if !exists {
			existing = append(existing, nextField)
			indexByName[key] = len(existing) - 1
			continue
		}
		existing[existingIndex] = mergeField(existing[existingIndex], nextField)
	}

	return existing
}

func inferField(name string, value any) Field {
	switch typed := value.(type) {
	case map[string]any:
		return Field{
			Name:   name,
			Type:   TypeObject,
			Fields: mergeObjectFields(nil, typed),
		}
	case formats.Record:
		return Field{
			Name:   name,
			Type:   TypeObject,
			Fields: mergeObjectFields(nil, map[string]any(typed)),
		}
	case []any:
		return Field{
			Name:   name,
			Type:   TypeArray,
			Fields: inferArrayFields(typed),
		}
	default:
		return Field{Name: name, Type: inferType(value)}
	}
}

func inferArrayFields(items []any) []Field {
	fields := []Field{}
	for _, item := range items {
		switch typed := item.(type) {
		case map[string]any:
			fields = mergeObjectFields(fields, typed)
		case formats.Record:
			fields = mergeObjectFields(fields, map[string]any(typed))
		}
	}
	return fields
}

func mergeField(existing Field, incoming Field) Field {
	existing.Type = mergeTypes(existing.Type, incoming.Type)
	if existing.Type == TypeObject || existing.Type == TypeArray {
		existing.Fields = mergeFieldChildren(existing.Fields, incoming.Fields)
	}
	return existing
}

func mergeFieldChildren(existing []Field, incoming []Field) []Field {
	indexByName := make(map[string]int, len(existing))
	for index, field := range existing {
		indexByName[field.Name] = index
	}
	for _, field := range incoming {
		existingIndex, exists := indexByName[field.Name]
		if !exists {
			existing = append(existing, field)
			indexByName[field.Name] = len(existing) - 1
			continue
		}
		existing[existingIndex] = mergeField(existing[existingIndex], field)
	}
	return existing
}

func mergeTypes(left, right Type) Type {
	if left == right {
		return left
	}
	if left == TypeObject || right == TypeObject {
		return TypeObject
	}
	if left == TypeArray || right == TypeArray {
		return TypeArray
	}
	if (left == TypeInteger && right == TypeNumber) || (left == TypeNumber && right == TypeInteger) {
		return TypeNumber
	}
	if left == TypeString || right == TypeString {
		return TypeString
	}
	return right
}
