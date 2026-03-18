package mapping

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
)

// Transform models a declarative transform attached to a field mapping.
type Transform struct {
	Type   string         `json:"type" yaml:"type"`
	Value  any            `json:"value,omitempty" yaml:"value,omitempty"`
	Values []string       `json:"values,omitempty" yaml:"values,omitempty"`
	When   *Condition     `json:"when,omitempty" yaml:"when,omitempty"`
	Params map[string]any `json:"params,omitempty" yaml:"params,omitempty"`
}

// Condition is a lightweight scaffold for conditional transforms.
type Condition struct {
	Path     string `json:"path,omitempty" yaml:"path,omitempty"`
	Equals   any    `json:"equals,omitempty" yaml:"equals,omitempty"`
	NotEmpty bool   `json:"notEmpty,omitempty" yaml:"notEmpty,omitempty"`
}

// FieldMapping maps one source path to one target path through ordered transforms.
type FieldMapping struct {
	From       string      `json:"from,omitempty" yaml:"from,omitempty"`
	To         string      `json:"to" yaml:"to"`
	Required   bool        `json:"required,omitempty" yaml:"required,omitempty"`
	Transforms []Transform `json:"transforms,omitempty" yaml:"transforms,omitempty"`
}

// Definition contains the ordered mapping instructions for a pipeline.
type Definition struct {
	Fields []FieldMapping `json:"fields" yaml:"fields"`
}

// Result captures mapped output and validation errors for previews and runtime status.
type Result struct {
	Record           formats.Record           `json:"record"`
	ValidationErrors []schema.ValidationError `json:"validationErrors,omitempty"`
}

// Engine applies declarative mappings to canonical source records.
type Engine struct {
	TargetSchema *schema.Definition
}

// MapRecord maps a source record into a target record.
func (engine Engine) MapRecord(ctx context.Context, definition Definition, source formats.Record) (Result, error) {
	_ = ctx
	result := formats.Record{}
	for _, field := range definition.Fields {
		value, ok := resolveFieldValue(source, field)
		if !ok {
			if field.Required {
				return Result{}, fmt.Errorf("required source field %q not found", field.From)
			}
			continue
		}

		for _, transform := range field.Transforms {
			transformed, err := applyTransform(source, value, transform)
			if err != nil {
				return Result{}, fmt.Errorf("transform %q for %q: %w", transform.Type, field.To, err)
			}
			value = transformed
		}

		if err := formats.SetPath(result, field.To, value); err != nil {
			return Result{}, fmt.Errorf("set path %q: %w", field.To, err)
		}
	}

	return Result{Record: result, ValidationErrors: schema.Validate(engine.TargetSchema, result)}, nil
}

// resolveFieldValue gets the initial source value or a nil placeholder when only transforms provide data.
func resolveFieldValue(source formats.Record, field FieldMapping) (any, bool) {
	if field.From == "" {
		return nil, true
	}
	return formats.GetPath(source, field.From)
}

// applyTransform runs a single transform in order.
func applyTransform(source formats.Record, value any, transform Transform) (any, error) {
	if transform.When != nil && !evaluateCondition(source, *transform.When) {
		return value, nil
	}

	switch transform.Type {
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
		return strconv.ParseBool(strings.TrimSpace(fmt.Sprint(value)))
	case "default":
		if value == nil || fmt.Sprint(value) == "" {
			return transform.Value, nil
		}
		return value, nil
	case "concat":
		parts := make([]string, 0, len(transform.Values)+1)
		for _, path := range transform.Values {
			if resolved, ok := formats.GetPath(source, path); ok {
				parts = append(parts, fmt.Sprint(resolved))
			}
		}
		if value != nil && fmt.Sprint(value) != "" {
			parts = append([]string{fmt.Sprint(value)}, parts...)
		}
		separator, _ := transform.Params["separator"].(string)
		return strings.Join(parts, separator), nil
	case "date_parse":
		// Date parsing is intentionally scaffolded so contributors can add layout-aware logic later.
		return value, nil
	case "conditional":
		// Conditional transforms are represented via When today and can be expanded in a future release.
		return value, nil
	default:
		return value, fmt.Errorf("unsupported transform")
	}
}

// evaluateCondition supports a small but useful subset of conditional behavior for v1.
func evaluateCondition(source formats.Record, condition Condition) bool {
	value, ok := formats.GetPath(source, condition.Path)
	if !ok {
		return false
	}
	if condition.NotEmpty {
		return fmt.Sprint(value) != ""
	}
	if condition.Equals != nil {
		return fmt.Sprint(value) == fmt.Sprint(condition.Equals)
	}
	return true
}
