package schema

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	jsonschema "github.com/santhosh-tekuri/jsonschema/v5"
)

// Type describes the primitive or structural type used by the internal schema model.
type Type string

const (
	// TypeString represents a textual field.
	TypeString Type = "string"
	// TypeNumber represents a floating-point capable field.
	TypeNumber Type = "number"
	// TypeInteger represents an integral field.
	TypeInteger Type = "integer"
	// TypeBoolean represents a true/false field.
	TypeBoolean Type = "boolean"
	// TypeObject represents a nested object field.
	TypeObject Type = "object"
	// TypeArray represents an array field.
	TypeArray Type = "array"
)

// Field describes a field in the internal schema tree.
type Field struct {
	Name        string            `json:"name" yaml:"name"`
	Type        Type              `json:"type" yaml:"type"`
	Required    bool              `json:"required,omitempty" yaml:"required,omitempty"`
	Description string            `json:"description,omitempty" yaml:"description,omitempty"`
	Column      string            `json:"column,omitempty" yaml:"column,omitempty"`
	Index       *int              `json:"index,omitempty" yaml:"index,omitempty"`
	Fields      []Field           `json:"fields,omitempty" yaml:"fields,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty" yaml:"metadata,omitempty"`
}

// Definition is the portable schema object used by pipelines and API payloads.
type Definition struct {
	Name       string  `json:"name,omitempty" yaml:"name,omitempty"`
	Type       Type    `json:"type" yaml:"type"`
	Fields     []Field `json:"fields,omitempty" yaml:"fields,omitempty"`
	JSONSchema any     `json:"jsonSchema,omitempty" yaml:"jsonSchema,omitempty"`
	XSDNote    string  `json:"xsdNote,omitempty" yaml:"xsdNote,omitempty"`
}

// ValidationError captures a path-aware validation issue.
type ValidationError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

// ValidateRecord validates a record against either the internal schema fields or JSON Schema.
func ValidateRecord(def Definition, record formats.Record) []ValidationError {
	if def.JSONSchema != nil {
		return validateJSONSchema(def.JSONSchema, record)
	}
	return validateFields("", def.Fields, map[string]any(record))
}

func validateFields(prefix string, fields []Field, source map[string]any) []ValidationError {
	errors := []ValidationError{}
	for _, field := range fields {
		path := field.Name
		if prefix != "" {
			path = prefix + "." + field.Name
		}

		value, exists := source[field.Name]
		if field.Required && !exists {
			errors = append(errors, ValidationError{Path: path, Message: "field is required"})
			continue
		}
		if !exists {
			continue
		}

		if field.Type == TypeArray {
			items, ok := value.([]any)
			if !ok {
				errors = append(errors, ValidationError{Path: path, Message: "expected array"})
				continue
			}
			if len(field.Fields) > 0 {
				for index, item := range items {
					nested, ok := item.(map[string]any)
					if !ok {
						if recordValue, recordOK := item.(formats.Record); recordOK {
							nested = map[string]any(recordValue)
							ok = true
						}
					}
					if !ok {
						errors = append(errors, ValidationError{
							Path:    fmt.Sprintf("%s[%d]", path, index),
							Message: "expected object item",
						})
						continue
					}
					errors = append(errors, validateFields(fmt.Sprintf("%s[%d]", path, index), field.Fields, nested)...)
				}
			}
			continue
		}

		if field.Type == TypeObject {
			nested, ok := value.(map[string]any)
			if !ok {
				if recordValue, recordOK := value.(formats.Record); recordOK {
					nested = map[string]any(recordValue)
					ok = true
				}
			}
			if !ok {
				errors = append(errors, ValidationError{Path: path, Message: "expected object"})
				continue
			}
			errors = append(errors, validateFields(path, field.Fields, nested)...)
		}
	}
	return errors
}

func validateJSONSchema(source any, record formats.Record) []ValidationError {
	compiler := jsonschema.NewCompiler()
	payload, err := json.Marshal(source)
	if err != nil {
		return []ValidationError{{Path: "$", Message: fmt.Sprintf("marshal json schema: %v", err)}}
	}
	if err := compiler.AddResource("schema.json", bytes.NewReader(payload)); err != nil {
		return []ValidationError{{Path: "$", Message: fmt.Sprintf("compile resource: %v", err)}}
	}
	compiled, err := compiler.Compile("schema.json")
	if err != nil {
		return []ValidationError{{Path: "$", Message: fmt.Sprintf("compile json schema: %v", err)}}
	}
	if err := compiled.Validate(map[string]any(record)); err != nil {
		return []ValidationError{{Path: "$", Message: err.Error()}}
	}
	return nil
}
