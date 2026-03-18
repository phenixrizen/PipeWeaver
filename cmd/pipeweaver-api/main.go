package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/api"
)

// main starts the PipeWeaver API server for local development.
func main() {
	storeRoot := os.Getenv("PIPEWEAVER_STORE_ROOT")
	if storeRoot == "" {
		storeRoot = ".pipeweaver/pipelines"
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
