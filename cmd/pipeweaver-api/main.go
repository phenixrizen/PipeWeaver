package main

import (
	"log"
	"net/http"
	"os"

	"github.com/phenixrizen/PipeWeaver/internal/api"
	"github.com/phenixrizen/PipeWeaver/internal/store"
)

// main boots the REST API and filesystem-backed pipeline store.
func main() {
	dataDir := os.Getenv("PIPEWEAVER_DATA_DIR")
	if dataDir == "" {
		dataDir = ".data/pipelines"
	}

	server := api.Server{Store: store.FilesystemStore{Root: dataDir}}
	address := ":8080"
	log.Printf("PipeWeaver API listening on %s", address)
	if err := http.ListenAndServe(address, server.NewMux()); err != nil {
		log.Fatal(err)
	}
}
