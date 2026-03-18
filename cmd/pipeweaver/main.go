package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
	"github.com/phenixrizen/PipeWeaver/internal/runtime"
)

// main runs a pipeline definition locally for development and testing.
func main() {
	var definitionPath string
	flag.StringVar(&definitionPath, "pipeline", "examples/pipelines/csv_http_to_json.yaml", "path to pipeline definition")
	flag.Parse()

	definition, err := pipeline.LoadFile(definitionPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load pipeline: %v\n", err)
		os.Exit(1)
	}

	preview, err := runtime.Executor{}.RunOneShot(context.Background(), definition)
	if err != nil {
		fmt.Fprintf(os.Stderr, "execute pipeline: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Execution completed in %dms\n%s\n", preview.DurationMS, preview.EncodedOutput)
}
