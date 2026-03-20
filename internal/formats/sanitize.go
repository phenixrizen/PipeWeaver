package formats

func sanitizeOutputValue(value any, omitNilValues bool) (any, bool) {
	if value == nil {
		return nil, !omitNilValues
	}

	switch typed := value.(type) {
	case Record:
		next, ok := sanitizeOutputMap(map[string]any(typed), omitNilValues)
		if !ok {
			return nil, false
		}
		return Record(next), true
	case map[string]any:
		return sanitizeOutputMap(typed, omitNilValues)
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			next, ok := sanitizeOutputValue(item, omitNilValues)
			if !ok {
				continue
			}
			items = append(items, next)
		}
		return items, true
	default:
		return value, true
	}
}

func sanitizeOutputMap(values map[string]any, omitNilValues bool) (map[string]any, bool) {
	if values == nil {
		return nil, !omitNilValues
	}

	sanitized := make(map[string]any, len(values))
	for key, value := range values {
		next, ok := sanitizeOutputValue(value, omitNilValues)
		if !ok {
			continue
		}
		sanitized[key] = next
	}

	if len(sanitized) == 0 && omitNilValues {
		return nil, false
	}

	return sanitized, true
}
