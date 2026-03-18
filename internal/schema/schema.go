package schema

import "github.com/phenixrizen/PipeWeaver/internal/formats"

// Type identifies the canonical field type understood by the validator and UI.
type Type string

const (
	TypeString  Type = "string"
	TypeInteger Type = "integer"
	TypeNumber  Type = "number"
	TypeBoolean Type = "boolean"
	TypeObject  Type = "object"
	TypeArray   Type = "array"
)

// ColumnMetadata stores delimited-file information used for inference and future mappers.
type ColumnMetadata struct {
	Index     int    `json:"index,omitempty" yaml:"index,omitempty"`
	Delimiter string `json:"delimiter,omitempty" yaml:"delimiter,omitempty"`
}

// Field models a canonical schema field.
type Field struct {
	Name        string          `json:"name" yaml:"name"`
	Path        string          `json:"path" yaml:"path"`
	Type        Type            `json:"type" yaml:"type"`
	Required    bool            `json:"required,omitempty" yaml:"required,omitempty"`
	Description string          `json:"description,omitempty" yaml:"description,omitempty"`
	Children    []Field         `json:"children,omitempty" yaml:"children,omitempty"`
	Column      *ColumnMetadata `json:"column,omitempty" yaml:"column,omitempty"`
}

// Definition is the root schema structure referenced by pipelines and API payloads.
type Definition struct {
	Name        string  `json:"name,omitempty" yaml:"name,omitempty"`
	Description string  `json:"description,omitempty" yaml:"description,omitempty"`
	Fields      []Field `json:"fields" yaml:"fields"`
	Format      string  `json:"format,omitempty" yaml:"format,omitempty"`
	XSDHint     string  `json:"xsdHint,omitempty" yaml:"xsdHint,omitempty"`
}

// ValidationError describes a schema mismatch for a specific canonical path.
type ValidationError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

// Validate checks a canonical record against a schema definition.
func Validate(definition *Definition, record formats.Record) []ValidationError {
	if definition == nil {
		return nil
	}

	var errors []ValidationError
	for _, field := range definition.Fields {
		errors = append(errors, validateField(field, record)...)
	}
	return errors
}

// validateField applies required checks, basic type checks, and nested validation.
func validateField(field Field, record formats.Record) []ValidationError {
	value, ok := formats.GetPath(record, field.Path)
	if !ok {
		if field.Required {
			return []ValidationError{{Path: field.Path, Message: "required field is missing"}}
		}
		return nil
	}

	var errors []ValidationError
	if !matchesType(field.Type, value) {
		errors = append(errors, ValidationError{Path: field.Path, Message: "unexpected value type"})
	}
	for _, child := range field.Children {
		if nested, ok := value.(map[string]any); ok {
			errors = append(errors, validateField(child, formats.Record(nested))...)
		}
	}
	return errors
}

// matchesType covers the common scalar and object shapes produced by v1 decoders and transforms.
func matchesType(expected Type, value any) bool {
	switch expected {
	case TypeString:
		_, ok := value.(string)
		return ok
	case TypeInteger:
		switch value.(type) {
		case int, int32, int64:
			return true
		}
	case TypeNumber:
		switch value.(type) {
		case float32, float64, int, int32, int64:
			return true
		}
	case TypeBoolean:
		_, ok := value.(bool)
		return ok
	case TypeObject:
		switch value.(type) {
		case formats.Record, map[string]any:
			return true
		}
	case TypeArray:
		_, ok := value.([]any)
		return ok
	default:
		return true
	}
	return false
}
