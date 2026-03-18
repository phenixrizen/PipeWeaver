package runtime

import (
	"context"
	"fmt"
	"time"

	"github.com/phenixrizen/PipeWeaver/internal/connectors"
	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/mapping"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// ExecutionResult captures runtime metadata, transformed records, and encoded output.
type ExecutionResult struct {
	PipelineID    string           `json:"pipelineId"`
	RecordCount   int              `json:"recordCount"`
	DurationMS    int64            `json:"durationMs"`
	Output        string           `json:"output"`
	Records       []formats.Record `json:"records"`
	Errors        []string         `json:"errors,omitempty"`
	Validations   map[int]any      `json:"validations,omitempty"`
	SourcePayload string           `json:"sourcePayload,omitempty"`
}

// Engine orchestrates the end-to-end execution of a pipeline.
type Engine struct{}

// Execute runs a one-shot pipeline with an optional injected source payload.
func (Engine) Execute(ctx context.Context, definition *pipeline.Definition, sourcePayload []byte) (*ExecutionResult, error) {
	started := time.Now()

	if len(sourcePayload) == 0 {
		sourceConnector, err := connectors.NewSourceConnector(definition.Source)
		if err != nil {
			return nil, err
		}
		sourcePayload, err = sourceConnector.Sample(ctx)
		if err != nil || len(sourcePayload) == 0 {
			sourcePayload, err = sourceConnector.Read(ctx)
			if err != nil {
				return nil, err
			}
		}
	}

	decoder, err := formats.NewDecoder(definition.Source.Format)
	if err != nil {
		return nil, err
	}
	records, err := decoder.Decode(ctx, sourcePayload)
	if err != nil {
		return nil, err
	}

	mapper := mapping.Engine{TargetSchema: definition.TargetSchema}
	mappedRecords := make([]formats.Record, 0, len(records))
	validations := map[int]any{}
	for index, record := range records {
		mapped, err := mapper.MapRecord(ctx, definition.Mapping, record)
		if err != nil {
			return nil, fmt.Errorf("map record %d: %w", index, err)
		}
		mappedRecords = append(mappedRecords, mapped.Record)
		if len(mapped.ValidationErrors) > 0 {
			validations[index] = mapped.ValidationErrors
		}
	}

	encoder, err := formats.NewEncoder(definition.Target.Format)
	if err != nil {
		return nil, err
	}
	encoded, err := encoder.Encode(ctx, mappedRecords)
	if err != nil {
		return nil, err
	}

	if definition.Target.Type != "" {
		sink, err := connectors.NewSinkConnector(definition.Target)
		if err == nil {
			if writeErr := sink.Write(ctx, encoded); writeErr != nil {
				// Sink errors are captured instead of failing previews so users can still inspect output.
				return &ExecutionResult{
					PipelineID:    definition.ID,
					RecordCount:   len(mappedRecords),
					DurationMS:    time.Since(started).Milliseconds(),
					Output:        string(encoded),
					Records:       mappedRecords,
					Errors:        []string{writeErr.Error()},
					Validations:   validations,
					SourcePayload: string(sourcePayload),
				}, nil
			}
		}
	}

	return &ExecutionResult{
		PipelineID:    definition.ID,
		RecordCount:   len(mappedRecords),
		DurationMS:    time.Since(started).Milliseconds(),
		Output:        string(encoded),
		Records:       mappedRecords,
		Validations:   validations,
		SourcePayload: string(sourcePayload),
	}, nil
}
