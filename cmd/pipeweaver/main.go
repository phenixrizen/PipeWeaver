package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
	"github.com/phenixrizen/PipeWeaver/internal/runtime"
)

// main runs a pipeline locally against a provided input file or saved sample input.
func main() {
	pipelinePath := flag.String("pipeline", "", "Path to the pipeline definition file")
	inputPath := flag.String("input", "", "Optional input file path")
	flag.Parse()

	if *pipelinePath == "" {
		log.Fatal("-pipeline is required")
	}

	definition, err := pipeline.LoadFile(*pipelinePath)
	if err != nil {
		log.Fatal(err)
	}

	var input []byte
	if *inputPath != "" {
		input, err = os.ReadFile(*inputPath)
		if err != nil {
			log.Fatal(err)
		}
	}

	result, err := runtime.Engine{}.Execute(context.Background(), definition, input)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Output)
}
