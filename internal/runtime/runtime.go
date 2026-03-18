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
	mapped, err := mapping.Apply(definition.Mapping, inputRecords, definition.TargetSchema)
	if err != nil {
		return PreviewResult{}, fmt.Errorf("apply mapping: %w", err)
	}
	encoder, err := formats.NewEncoder(definition.Target.Format)
	if err != nil {
		return PreviewResult{}, err
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
