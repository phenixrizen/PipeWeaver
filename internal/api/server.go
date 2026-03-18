package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
	"github.com/phenixrizen/PipeWeaver/internal/runtime"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
	"github.com/phenixrizen/PipeWeaver/internal/store"
)

// Server contains the dependencies required by the REST API.
type Server struct {
	Store   store.PipelineStore
	Runtime runtime.Engine
}

// NewMux builds the API routes and lightweight static file hosting for the frontend build.
func (server Server) NewMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pipelines", server.handlePipelines)
	mux.HandleFunc("/api/pipelines/", server.handlePipelineByID)
	mux.HandleFunc("/api/schema/infer", server.handleInferSchema)
	mux.HandleFunc("/api/mapping/preview", server.handlePreview)
	mux.HandleFunc("/healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	return loggingMiddleware(mux)
}

// loggingMiddleware logs request method, path, and status-friendly context.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		log.Printf("%s %s", request.Method, request.URL.Path)
		next.ServeHTTP(writer, request)
	})
}

// handlePipelines supports pipeline creation and listing.
func (server Server) handlePipelines(writer http.ResponseWriter, request *http.Request) {
	switch request.Method {
	case http.MethodGet:
		definitions, err := server.Store.List()
		if err != nil {
			writeError(writer, http.StatusInternalServerError, err)
			return
		}
		writeJSON(writer, http.StatusOK, definitions)
	case http.MethodPost:
		var definition pipeline.Definition
		if err := json.NewDecoder(request.Body).Decode(&definition); err != nil {
			writeError(writer, http.StatusBadRequest, err)
			return
		}
		if definition.ID == "" {
			writeError(writer, http.StatusBadRequest, fmt.Errorf("pipeline id is required"))
			return
		}
		if err := server.Store.Save(&definition); err != nil {
			writeError(writer, http.StatusInternalServerError, err)
			return
		}
		writeJSON(writer, http.StatusCreated, definition)
	default:
		writer.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handlePipelineByID supports retrieval and test execution.
func (server Server) handlePipelineByID(writer http.ResponseWriter, request *http.Request) {
	path := strings.TrimPrefix(request.URL.Path, "/api/pipelines/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(writer, http.StatusBadRequest, fmt.Errorf("pipeline id is required"))
		return
	}
	id := parts[0]

	if len(parts) == 2 && parts[1] == "test" {
		server.handlePipelineTest(writer, request, id)
		return
	}

	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	definition, err := server.Store.Get(id)
	if err != nil {
		writeError(writer, http.StatusNotFound, err)
		return
	}
	writeJSON(writer, http.StatusOK, definition)
}

// handlePipelineTest executes a stored pipeline against a provided or saved sample payload.
func (server Server) handlePipelineTest(writer http.ResponseWriter, request *http.Request, id string) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	definition, err := server.Store.Get(id)
	if err != nil {
		writeError(writer, http.StatusNotFound, err)
		return
	}
	var payload struct {
		Input string `json:"input"`
	}
	_ = json.NewDecoder(request.Body).Decode(&payload)
	result, err := server.Runtime.Execute(request.Context(), definition, []byte(payload.Input))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

// handleInferSchema infers a schema from sample content and the provided format.
func (server Server) handleInferSchema(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		Name   string `json:"name"`
		Format string `json:"format"`
		Input  string `json:"input"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	decoder, err := formats.NewDecoder(payload.Format)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	records, err := decoder.Decode(request.Context(), []byte(payload.Input))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	writeJSON(writer, http.StatusOK, schema.InferDefinition(payload.Name, payload.Format, records))
}

// handlePreview runs an ad-hoc pipeline preview without saving it first.
func (server Server) handlePreview(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		Pipeline pipeline.Definition `json:"pipeline"`
		Input    string              `json:"input"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	result, err := server.Runtime.Execute(request.Context(), &payload.Pipeline, []byte(payload.Input))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

// writeJSON serializes responses consistently.
func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

// writeError renders error payloads in a machine-friendly shape.
func writeError(writer http.ResponseWriter, status int, err error) {
	writeJSON(writer, status, map[string]string{"error": err.Error()})
}
