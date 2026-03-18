package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/api"
	"github.com/phenixrizen/PipeWeaver/internal/store"
)

// main starts the PipeWeaver API server for local development.
func main() {
	storeRoot := os.Getenv("PIPEWEAVER_STORE_ROOT")
	if storeRoot == "" {
		storeRoot = ".pipeweaver/pipelines"
	}

	seedExamples := flag.Bool("seed-examples", false, "seed the pipeline store with example definitions before serving requests")
	seedSource := flag.String("seed-source", "examples/pipelines", "directory of pipeline definitions used when seeding the store")
	flag.Parse()

	if *seedExamples {
		filesystemStore, err := store.NewFilesystemStore(storeRoot)
		if err != nil {
			fmt.Fprintf(os.Stderr, "create filesystem store: %v\n", err)
			os.Exit(1)
		}
		seeded, err := filesystemStore.SeedFromDir(*seedSource)
		if err != nil {
			fmt.Fprintf(os.Stderr, "seed pipeline store: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Seeded %d pipeline(s) from %s into %s\n", seeded, *seedSource, storeRoot)
	}

	server, err := api.NewServer(storeRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "create api server: %v\n", err)
		os.Exit(1)
	}

	address := ":8080"
	fmt.Printf("PipeWeaver API listening on %s\n", address)
	if err := http.ListenAndServe(address, server.Routes()); err != nil {
		fmt.Fprintf(os.Stderr, "listen: %v\n", err)
		os.Exit(1)
	}
}
