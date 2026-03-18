package formats

import (
	"fmt"
	"strings"
)

// Record represents the canonical intermediate structure used across decoders, mappers, validators, and encoders.
type Record map[string]any

// CloneRecord performs a deep-enough clone for nested map values so mapping operations do not mutate shared state.
func CloneRecord(input Record) Record {
	output := Record{}
	for key, value := range input {
		switch typed := value.(type) {
		case map[string]any:
			output[key] = CloneRecord(Record(typed))
		case Record:
			output[key] = CloneRecord(typed)
		default:
			output[key] = typed
		}
	}
	return output
}

// GetPath resolves a dot-notated path from the canonical record model.
func GetPath(record Record, path string) (any, bool) {
	if path == "" {
		return record, true
	}

	segments := strings.Split(path, ".")
	var current any = map[string]any(record)
	for _, segment := range segments {
		currentMap, ok := current.(map[string]any)
		if !ok {
			recordMap, recordOK := current.(Record)
			if !recordOK {
				return nil, false
			}
			currentMap = map[string]any(recordMap)
		}

		next, exists := currentMap[segment]
		if !exists {
			return nil, false
		}
		current = next
	}

	return current, true
}

// SetPath writes a value into the canonical record using dot notation and creates intermediate maps on demand.
func SetPath(record Record, path string, value any) error {
	if path == "" {
		return fmt.Errorf("path is required")
	}

	segments := strings.Split(path, ".")
	current := map[string]any(record)
	for idx, segment := range segments {
		if idx == len(segments)-1 {
			current[segment] = value
			return nil
		}

		next, exists := current[segment]
		if !exists {
			child := map[string]any{}
			current[segment] = child
			current = child
			continue
		}

		switch typed := next.(type) {
		case map[string]any:
			current = typed
		case Record:
			current = map[string]any(typed)
		default:
			return fmt.Errorf("cannot descend into %q because it is not an object", segment)
		}
	}

	return nil
}
