package runtime

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/phenixrizen/PipeWeaver/internal/connectors"
	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/mapping"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
)

// PreviewResult packages runtime output for API responses and CLI summaries.
type PreviewResult struct {
	InputRecords     []formats.Record `json:"inputRecords"`
	OutputRecords    []formats.Record `json:"outputRecords"`
	EncodedOutput    string           `json:"encodedOutput"`
	ValidationErrors any              `json:"validationErrors,omitempty"`
	DurationMS       int64            `json:"durationMs"`
}

// Executor coordinates the end-to-end pipeline execution.
type Executor struct{}

// RunOneShot executes a pipeline using configured connectors.
func (e Executor) RunOneShot(ctx context.Context, definition pipeline.Definition) (PreviewResult, error) {
	source, err := connectors.NewSource(definition.Source)
	if err != nil {
		return PreviewResult{}, err
	}
	payload, err := source.Read(ctx)
	if err != nil {
		return PreviewResult{}, err
	}
	preview, err := e.RunPreview(ctx, definition, payload)
	if err != nil {
		return PreviewResult{}, err
	}
	sink, err := connectors.NewSink(definition.Target)
	if err != nil {
		return PreviewResult{}, err
	}
	if err := sink.Write(ctx, []byte(preview.EncodedOutput), preview.OutputRecords); err != nil {
		return PreviewResult{}, err
	}
	return preview, nil
}

// RunPreview executes a pipeline against provided sample payload bytes without depending on the source connector.
func (e Executor) RunPreview(ctx context.Context, definition pipeline.Definition, payload []byte) (PreviewResult, error) {
	started := time.Now()
	decoder, err := formats.NewDecoder(definition.Source.Format)
	if err != nil {
		return PreviewResult{}, err
	}
	inputRecords, err := decoder.Decode(ctx, payload)
	if err != nil {
		return PreviewResult{}, fmt.Errorf("decode input: %w", err)
	}
	mapped, err := mapping.Apply(
		definition.Mapping,
		inputRecords,
		definition.TargetSchema,
		buildMappingOptions(definition),
	)
	if err != nil {
		return PreviewResult{}, fmt.Errorf("apply mapping: %w", err)
	}
	var encoder formats.Encoder
	omitNullValues := targetOmitNullValues(definition.Target.Config)
	switch strings.ToLower(definition.Target.Format) {
	case "json":
		encoder = formats.JSONEncoder{OmitNilValues: omitNullValues}
	case "xml":
		itemName := "record"
		if definition.TargetSchema != nil && definition.TargetSchema.Name != "" {
			itemName = definition.TargetSchema.Name
		}
		encoder = formats.XMLEncoder{
			RootName:      "records",
			ItemName:      itemName,
			OmitNilValues: omitNullValues,
		}
	case "csv":
		encoder = formats.DelimitedEncoder{
			Delimiter:  ',',
			Columns:    buildDelimitedColumns(definition.TargetSchema),
			NilAsEmpty: omitNullValues,
		}
	case "tsv":
		encoder = formats.DelimitedEncoder{
			Delimiter:  '\t',
			Columns:    buildDelimitedColumns(definition.TargetSchema),
			NilAsEmpty: omitNullValues,
		}
	case "pipe", "pipe-delimited":
		encoder = formats.DelimitedEncoder{
			Delimiter:  '|',
			Columns:    buildDelimitedColumns(definition.TargetSchema),
			NilAsEmpty: omitNullValues,
		}
	default:
		encoder, err = formats.NewEncoder(definition.Target.Format)
		if err != nil {
			return PreviewResult{}, err
		}
	}
	encoded, err := encoder.Encode(ctx, mapped.Records)
	if err != nil {
		return PreviewResult{}, fmt.Errorf("encode output: %w", err)
	}
	return PreviewResult{
		InputRecords:     inputRecords,
		OutputRecords:    mapped.Records,
		EncodedOutput:    string(encoded),
		ValidationErrors: mapped.ValidationErrors,
		DurationMS:       time.Since(started).Milliseconds(),
	}, nil
}

func targetOmitNullValues(config map[string]any) bool {
	if config == nil {
		return false
	}

	value, ok := config["omitNullValues"]
	if !ok {
		return false
	}

	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "true")
	default:
		return false
	}
}

func buildMappingOptions(definition pipeline.Definition) mapping.ApplyOptions {
	options := mapping.ApplyOptions{
		DefaultRepeatMode:    "preserve",
		DefaultJoinDelimiter: ", ",
		TargetFormat:         definition.Target.Format,
	}

	if definition.Source.Config == nil {
		return options
	}

	if mode, ok := definition.Source.Config["xmlRepeatedElementsMode"].(string); ok && strings.TrimSpace(mode) != "" {
		options.DefaultRepeatMode = mode
	}
	if delimiter, ok := definition.Source.Config["arrayJoinDelimiter"].(string); ok && strings.TrimSpace(delimiter) != "" {
		options.DefaultJoinDelimiter = delimiter
	}

	return options
}

func buildDelimitedColumns(definition *schema.Definition) []formats.DelimitedColumn {
	if definition == nil {
		return nil
	}

	columns := []formats.DelimitedColumn{}
	var walk func(fields []schema.Field, prefix string)
	walk = func(fields []schema.Field, prefix string) {
		for _, field := range fields {
			key := field.Name
			if prefix != "" {
				key = prefix + "." + field.Name
			}
			if field.Type == schema.TypeObject && len(field.Fields) > 0 {
				walk(field.Fields, key)
				continue
			}
			header := field.Column
			if header == "" {
				header = key
			}
			columns = append(columns, formats.DelimitedColumn{
				Key:    key,
				Header: header,
			})
		}
	}
	walk(definition.Fields, "")
	return columns
}
