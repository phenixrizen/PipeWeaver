package formats

import (
	"fmt"
	"strconv"
	"strings"
)

// Record is the canonical intermediate representation used across every pipeline stage.
type Record map[string]any

// GetPath resolves a dot-delimited field path from a record or nested map structure.
func GetPath(data any, path string) (any, bool) {
	// Short-circuit empty paths so transforms can intentionally target the entire record.
	if path == "" {
		return data, true
	}

	current := data
	for _, part := range strings.Split(path, ".") {
		switch typed := current.(type) {
		case Record:
			value, ok := typed[part]
			if !ok {
				return nil, false
			}
			current = value
		case map[string]any:
			value, ok := typed[part]
			if !ok {
				return nil, false
			}
			current = value
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, false
			}
			current = typed[index]
		default:
			return nil, false
		}
	}

	return current, true
}

// SetPath writes a value into a record, creating intermediate maps as needed.
func SetPath(record Record, path string, value any) error {
	if path == "" {
		return fmt.Errorf("path is required")
	}

	parts := strings.Split(path, ".")
	current := map[string]any(record)
	for index, part := range parts {
		if index == len(parts)-1 {
			current[part] = value
			return nil
		}

		next, ok := current[part]
		if !ok {
			child := map[string]any{}
			current[part] = child
			current = child
			continue
		}

		typed, ok := next.(map[string]any)
		if !ok {
			if nestedRecord, ok := next.(Record); ok {
				typed = nestedRecord
			} else {
				return fmt.Errorf("path segment %q is not an object", part)
			}
		}
		current = typed
	}

	return nil
}

// CloneRecord creates a deep-enough copy for maps and arrays used in previews and runtime writes.
func CloneRecord(record Record) Record {
	cloned := Record{}
	for key, value := range record {
		cloned[key] = cloneValue(value)
	}
	return cloned
}

// cloneValue recursively copies the common nested types the runtime produces.
func cloneValue(value any) any {
	switch typed := value.(type) {
	case Record:
		return CloneRecord(typed)
	case map[string]any:
		clone := map[string]any{}
		for key, nested := range typed {
			clone[key] = cloneValue(nested)
		}
		return clone
	case []any:
		clone := make([]any, len(typed))
		for index, nested := range typed {
			clone[index] = cloneValue(nested)
		}
		return clone
	default:
		return typed
	}
}
