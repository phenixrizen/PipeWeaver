package schema

// ToJSONSchema exports the internal field-based schema into a lightweight JSON Schema object.
func ToJSONSchema(def Definition) map[string]any {
	properties := map[string]any{}
	required := []string{}
	for _, field := range def.Fields {
		properties[field.Name] = fieldToJSONSchema(field)
		if field.Required {
			required = append(required, field.Name)
		}
	}

	schema := map[string]any{
		"$schema":    "https://json-schema.org/draft/2020-12/schema",
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func fieldToJSONSchema(field Field) map[string]any {
	result := map[string]any{"type": string(field.Type)}
	if field.Type == TypeObject {
		nested := Definition{Type: TypeObject, Fields: field.Fields}
		for key, value := range ToJSONSchema(nested) {
			result[key] = value
		}
	}
	if field.Description != "" {
		result["description"] = field.Description
	}
	return result
}
