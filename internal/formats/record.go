package formats

import (
	"fmt"
	"strconv"
	"strings"
)

// Record represents the canonical intermediate structure used across decoders, mappers, validators, and encoders.
type Record map[string]any

// CloneRecord performs a deep-enough clone for nested map values so mapping operations do not mutate shared state.
func CloneRecord(input Record) Record {
	output := Record{}
	for key, value := range input {
		output[key] = cloneValue(value)
	}
	return output
}

func cloneValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return CloneRecord(Record(typed))
	case Record:
		return CloneRecord(typed)
	case []any:
		items := make([]any, len(typed))
		for index, item := range typed {
			items[index] = cloneValue(item)
		}
		return items
	default:
		return typed
	}
}

// GetPath resolves a dot-notated path from the canonical record model.
func GetPath(record Record, path string) (any, bool) {
	if path == "" {
		return record, true
	}

	return getPathValue(map[string]any(record), parsePath(path))
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

type pathSegment struct {
	key   string
	index int
}

func parsePath(path string) []pathSegment {
	rawSegments := strings.Split(path, ".")
	segments := make([]pathSegment, 0, len(rawSegments))
	for _, raw := range rawSegments {
		segment := pathSegment{key: raw}
		if bracket := strings.LastIndex(raw, "["); bracket > 0 && strings.HasSuffix(raw, "]") {
			index, err := strconv.Atoi(raw[bracket+1 : len(raw)-1])
			if err == nil && index > 0 {
				segment.key = raw[:bracket]
				segment.index = index
			}
		}
		segments = append(segments, segment)
	}
	return segments
}

func getPathValue(current any, segments []pathSegment) (any, bool) {
	if len(segments) == 0 {
		return current, true
	}

	if items, ok := current.([]any); ok {
		flattened := make([]any, 0, len(items))
		for _, item := range items {
			value, exists := getPathValue(item, segments)
			if !exists {
				continue
			}
			if nested, nestedOK := value.([]any); nestedOK {
				flattened = append(flattened, nested...)
				continue
			}
			flattened = append(flattened, value)
		}
		if len(flattened) == 0 {
			return nil, false
		}
		return flattened, true
	}

	currentMap, ok := current.(map[string]any)
	if !ok {
		recordMap, recordOK := current.(Record)
		if !recordOK {
			return nil, false
		}
		currentMap = map[string]any(recordMap)
	}

	next, exists := currentMap[segments[0].key]
	if !exists {
		return nil, false
	}

	indexedValue, ok := applyPathIndex(next, segments[0].index)
	if !ok {
		return nil, false
	}

	return getPathValue(indexedValue, segments[1:])
}

func applyPathIndex(value any, index int) (any, bool) {
	if index <= 0 {
		return value, true
	}

	items, ok := value.([]any)
	if ok {
		if index > len(items) {
			return nil, false
		}
		return items[index-1], true
	}

	if index == 1 {
		return value, true
	}

	return nil, false
}
