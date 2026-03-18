package mapping

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
)

// Transform represents a configurable transformation step in a field mapping.
type Transform struct {
	Type   string   `json:"type" yaml:"type"`
	Value  any      `json:"value,omitempty" yaml:"value,omitempty"`
	Values []string `json:"values,omitempty" yaml:"values,omitempty"`
	Then   any      `json:"then,omitempty" yaml:"then,omitempty"`
	Else   any      `json:"else,omitempty" yaml:"else,omitempty"`
}

// FieldMapping describes how a source path populates a target path.
type FieldMapping struct {
	From       string      `json:"from,omitempty" yaml:"from,omitempty"`
	Expression string      `json:"expression,omitempty" yaml:"expression,omitempty"`
	To         string      `json:"to" yaml:"to"`
	Required   bool        `json:"required,omitempty" yaml:"required,omitempty"`
	Transforms []Transform `json:"transforms,omitempty" yaml:"transforms,omitempty"`
}

// Spec wraps a list of field mappings.
type Spec struct {
	Fields []FieldMapping `json:"fields" yaml:"fields"`
}

// Result captures mapped records plus validation output.
type Result struct {
	Records          []formats.Record         `json:"records"`
	ValidationErrors []schema.ValidationError `json:"validationErrors,omitempty"`
}

// Apply executes the mapping spec against one or more input records.
func Apply(spec Spec, source []formats.Record, targetSchema *schema.Definition) (Result, error) {
	result := Result{Records: make([]formats.Record, 0, len(source))}
	for _, input := range source {
		output := formats.Record{}
		for _, field := range spec.Fields {
			value, exists, err := resolveFieldValue(input, field)
			if err != nil {
				return Result{}, fmt.Errorf("resolve value for %q: %w", field.To, err)
			}
			if field.Required && !exists {
				result.ValidationErrors = append(result.ValidationErrors, schema.ValidationError{Path: field.To, Message: "required mapping source missing"})
				continue
			}
			if !exists {
				continue
			}

			transformed, err := applyTransforms(input, value, field.Transforms)
			if err != nil {
				return Result{}, fmt.Errorf("apply transforms for %q: %w", field.To, err)
			}
			if err := formats.SetPath(output, field.To, transformed); err != nil {
				return Result{}, fmt.Errorf("set path %q: %w", field.To, err)
			}
		}
		if targetSchema != nil {
			result.ValidationErrors = append(result.ValidationErrors, schema.ValidateRecord(*targetSchema, output)...)
		}
		result.Records = append(result.Records, output)
	}
	return result, nil
}

func resolveFieldValue(record formats.Record, field FieldMapping) (any, bool, error) {
	if field.Expression != "" {
		value, err := EvaluateExpression(record, field.Expression)
		if err != nil {
			return nil, false, err
		}
		return value, true, nil
	}
	if field.From == "" {
		return nil, true, nil
	}
	value, ok := formats.GetPath(record, field.From)
	return value, ok, nil
}

func applyTransforms(record formats.Record, value any, transforms []Transform) (any, error) {
	current := value
	for _, transform := range transforms {
		var err error
		current, err = applyTransform(record, current, transform)
		if err != nil {
			return nil, err
		}
	}
	return current, nil
}

func applyTransform(record formats.Record, value any, transform Transform) (any, error) {
	switch strings.ToLower(transform.Type) {
	case "trim":
		return strings.TrimSpace(fmt.Sprint(value)), nil
	case "upper":
		return strings.ToUpper(fmt.Sprint(value)), nil
	case "lower":
		return strings.ToLower(fmt.Sprint(value)), nil
	case "to_int":
		return strconv.Atoi(strings.TrimSpace(fmt.Sprint(value)))
	case "to_float":
		return strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(value)), 64)
	case "to_bool":
		return strconv.ParseBool(strings.TrimSpace(strings.ToLower(fmt.Sprint(value))))
	case "default":
		if value == nil || strings.TrimSpace(fmt.Sprint(value)) == "" || fmt.Sprint(value) == "<nil>" {
			return transform.Value, nil
		}
		return value, nil
	case "concat":
		parts := []string{}
		if value != nil && fmt.Sprint(value) != "<nil>" {
			parts = append(parts, fmt.Sprint(value))
		}
		for _, path := range transform.Values {
			if resolved, ok := formats.GetPath(record, path); ok {
				parts = append(parts, fmt.Sprint(resolved))
			}
		}
		return strings.Join(parts, fmt.Sprint(transform.Value)), nil
	case "conditional":
		// This scaffold keeps the configuration shape stable for future richer conditions.
		if value == nil || fmt.Sprint(value) == "" {
			return transform.Else, nil
		}
		return transform.Then, nil
	case "date_parse":
		// This scaffold intentionally returns the input until richer date parsing formats are added.
		return value, nil
	default:
		return value, fmt.Errorf("unsupported transform %q", transform.Type)
	}
}
