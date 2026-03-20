package mapping

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

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
	From          string      `json:"from,omitempty" yaml:"from,omitempty"`
	Expression    string      `json:"expression,omitempty" yaml:"expression,omitempty"`
	To            string      `json:"to" yaml:"to"`
	Required      bool        `json:"required,omitempty" yaml:"required,omitempty"`
	RepeatMode    string      `json:"repeatMode,omitempty" yaml:"repeatMode,omitempty"`
	JoinDelimiter string      `json:"joinDelimiter,omitempty" yaml:"joinDelimiter,omitempty"`
	Transforms    []Transform `json:"transforms,omitempty" yaml:"transforms,omitempty"`
}

// Spec wraps a list of field mappings.
type Spec struct {
	Fields        []FieldMapping `json:"fields" yaml:"fields"`
	RowDriverPath string         `json:"rowDriverPath,omitempty" yaml:"rowDriverPath,omitempty"`
}

// Result captures mapped records plus validation output.
type Result struct {
	Records          []formats.Record         `json:"records"`
	ValidationErrors []schema.ValidationError `json:"validationErrors,omitempty"`
}

// ApplyOptions controls repeat behavior and target-format-aware shaping.
type ApplyOptions struct {
	DefaultRepeatMode    string
	DefaultJoinDelimiter string
	TargetFormat         string
	DisableFieldExplode  bool
}

// Apply executes the mapping spec against one or more input records.
func Apply(spec Spec, source []formats.Record, targetSchema *schema.Definition, options ApplyOptions) (Result, error) {
	result := Result{Records: make([]formats.Record, 0, len(source))}
	for _, input := range source {
		scopedInputs, err := scopedInputsForRowDriver(input, spec.RowDriverPath)
		if err != nil {
			return Result{}, fmt.Errorf("prepare row driver %q: %w", spec.RowDriverPath, err)
		}

		fieldOptions := options
		if strings.TrimSpace(spec.RowDriverPath) != "" {
			fieldOptions.DisableFieldExplode = true
		}

		for _, scopedInput := range scopedInputs {
			outputs := []formats.Record{{}}
			for _, field := range spec.Fields {
				value, exists, err := resolveFieldValue(scopedInput, field)
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

				transformed, err := applyTransforms(scopedInput, value, field.Transforms)
				if err != nil {
					return Result{}, fmt.Errorf("apply transforms for %q: %w", field.To, err)
				}
				outputs, err = applyField(outputs, field, transformed, fieldOptions)
				if err != nil {
					return Result{}, fmt.Errorf("set path %q: %w", field.To, err)
				}
			}
			if targetSchema != nil {
				for _, output := range outputs {
					result.ValidationErrors = append(result.ValidationErrors, schema.ValidateRecord(*targetSchema, output)...)
				}
			}
			result.Records = append(result.Records, outputs...)
		}
	}
	return result, nil
}

func scopedInputsForRowDriver(input formats.Record, rowDriverPath string) ([]formats.Record, error) {
	if strings.TrimSpace(rowDriverPath) == "" {
		return []formats.Record{input}, nil
	}

	driverValue, ok := formats.GetPath(input, rowDriverPath)
	if !ok {
		return nil, nil
	}

	items, isArray := driverValue.([]any)
	if !isArray {
		items = []any{driverValue}
	}
	if len(items) == 0 {
		return nil, nil
	}

	scoped := make([]formats.Record, 0, len(items))
	for _, item := range items {
		record := formats.CloneRecord(input)
		if err := formats.SetPath(record, rowDriverPath, item); err != nil {
			return nil, err
		}
		scoped = append(scoped, record)
	}
	return scoped, nil
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
		if items, ok := current.([]any); ok {
			next := make([]any, len(items))
			for index, item := range items {
				next[index], err = applyTransform(record, item, transform)
				if err != nil {
					return nil, err
				}
			}
			current = next
			continue
		}
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
	case "normalize_whitespace":
		return strings.Join(strings.Fields(fmt.Sprint(value)), " "), nil
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
		if isEmptyValue(value) {
			return transform.Value, nil
		}
		return value, nil
	case "prefix":
		return fmt.Sprint(transform.Value) + stringifyValue(value), nil
	case "suffix":
		return stringifyValue(value) + fmt.Sprint(transform.Value), nil
	case "replace":
		if len(transform.Values) < 2 {
			return value, fmt.Errorf("replace transform requires values[0]=find and values[1]=replace")
		}
		return strings.ReplaceAll(
			stringifyValue(value),
			transform.Values[0],
			transform.Values[1],
		), nil
	case "substring":
		if len(transform.Values) == 0 {
			return value, fmt.Errorf("substring transform requires values[0]=start and optional values[1]=length")
		}
		start, err := strconv.Atoi(strings.TrimSpace(transform.Values[0]))
		if err != nil {
			return value, fmt.Errorf("substring start: %w", err)
		}
		if start < 0 {
			return value, fmt.Errorf("substring start must be non-negative")
		}
		current := []rune(stringifyValue(value))
		if start >= len(current) {
			return "", nil
		}
		end := len(current)
		if len(transform.Values) > 1 && strings.TrimSpace(transform.Values[1]) != "" {
			length, err := strconv.Atoi(strings.TrimSpace(transform.Values[1]))
			if err != nil {
				return value, fmt.Errorf("substring length: %w", err)
			}
			if length < 0 {
				return value, fmt.Errorf("substring length must be non-negative")
			}
			end = start + length
			if end > len(current) {
				end = len(current)
			}
		}
		return string(current[start:end]), nil
	case "coalesce":
		if !isEmptyValue(value) {
			return value, nil
		}
		for _, path := range transform.Values {
			resolved, ok := formats.GetPath(record, path)
			if ok && !isEmptyValue(resolved) {
				return resolved, nil
			}
		}
		if transform.Value != nil {
			return transform.Value, nil
		}
		return value, nil
	case "concat":
		parts := []string{}
		if !isEmptyValue(value) {
			parts = append(parts, stringifyValue(value))
		}
		for _, path := range transform.Values {
			if resolved, ok := formats.GetPath(record, path); ok {
				parts = append(parts, stringifyValue(resolved))
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

func isEmptyValue(value any) bool {
	if value == nil {
		return true
	}
	stringified := stringifyValue(value)
	return stringified == "" || strings.TrimSpace(stringified) == ""
}

func stringifyValue(value any) string {
	if value == nil {
		return ""
	}
	stringified := fmt.Sprint(value)
	if stringified == "<nil>" {
		return ""
	}
	if !utf8.ValidString(stringified) {
		return ""
	}
	return stringified
}

func applyField(
	outputs []formats.Record,
	field FieldMapping,
	value any,
	options ApplyOptions,
) ([]formats.Record, error) {
	if items, ok := value.([]any); ok {
		if !options.DisableFieldExplode && resolveRepeatMode(field, options) == "explode" {
			return explodeField(outputs, field.To, items)
		}
		if isTabularTarget(options.TargetFormat) {
			value = joinArrayValues(items, resolveJoinDelimiter(field, options))
		}
	}

	for _, output := range outputs {
		if err := formats.SetPath(output, field.To, value); err != nil {
			return nil, err
		}
	}
	return outputs, nil
}

func explodeField(outputs []formats.Record, path string, items []any) ([]formats.Record, error) {
	if len(items) == 0 {
		return outputs, nil
	}

	next := make([]formats.Record, 0, len(outputs)*len(items))
	for _, output := range outputs {
		for _, item := range items {
			cloned := formats.CloneRecord(output)
			if err := formats.SetPath(cloned, path, item); err != nil {
				return nil, err
			}
			next = append(next, cloned)
		}
	}
	return next, nil
}

func resolveRepeatMode(field FieldMapping, options ApplyOptions) string {
	mode := strings.ToLower(strings.TrimSpace(field.RepeatMode))
	if mode == "" || mode == "inherit" {
		mode = strings.ToLower(strings.TrimSpace(options.DefaultRepeatMode))
	}
	if mode == "explode" {
		return "explode"
	}
	return "preserve"
}

func resolveJoinDelimiter(field FieldMapping, options ApplyOptions) string {
	if strings.TrimSpace(field.JoinDelimiter) != "" {
		return field.JoinDelimiter
	}
	if strings.TrimSpace(options.DefaultJoinDelimiter) != "" {
		return options.DefaultJoinDelimiter
	}
	return ", "
}

func joinArrayValues(items []any, delimiter string) string {
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, stringifyValue(item))
	}
	return strings.Join(parts, delimiter)
}

func isTabularTarget(format string) bool {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "csv", "tsv", "pipe", "pipe-delimited":
		return true
	default:
		return false
	}
}
