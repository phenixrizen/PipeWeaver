package schema

import "encoding/json"

// JSONSchema is a minimal adapter model for import/export of JSON Schema-like definitions.
type JSONSchema struct {
	Type       string                `json:"type,omitempty"`
	Properties map[string]JSONSchema `json:"properties,omitempty"`
	Required   []string              `json:"required,omitempty"`
}

// ToJSONSchema converts an internal schema definition into a minimal JSON Schema representation.
func ToJSONSchema(definition *Definition) JSONSchema {
	result := JSONSchema{Type: "object", Properties: map[string]JSONSchema{}}
	for _, field := range definition.Fields {
		result.Properties[field.Name] = JSONSchema{Type: string(field.Type)}
		if field.Required {
			result.Required = append(result.Required, field.Name)
		}
	}
	return result
}

// FromJSONSchema converts a minimal JSON Schema payload into an internal definition.
func FromJSONSchema(name string, payload []byte) (*Definition, error) {
	var schema JSONSchema
	if err := json.Unmarshal(payload, &schema); err != nil {
		return nil, err
	}
	definition := &Definition{Name: name, Format: "json"}
	for fieldName, property := range schema.Properties {
		field := Field{Name: fieldName, Path: fieldName, Type: Type(property.Type)}
		for _, required := range schema.Required {
			if required == fieldName {
				field.Required = true
			}
		}
		definition.Fields = append(definition.Fields, field)
	}
	return definition, nil
}
