package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/formats"
	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
	"github.com/phenixrizen/PipeWeaver/internal/runtime"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
	"github.com/phenixrizen/PipeWeaver/internal/store"
)

// Server groups API dependencies and exposes an http.Handler.
type Server struct {
	store    *store.FilesystemStore
	executor runtime.Executor
}

// NewServer creates a server instance using the filesystem store.
func NewServer(root string) (*Server, error) {
	filesystemStore, err := store.NewFilesystemStore(root)
	if err != nil {
		return nil, err
	}
	return &Server{store: filesystemStore, executor: runtime.Executor{}}, nil
}

// Routes configures the REST API with permissive CORS for local development.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pipelines", s.handlePipelines)
	mux.HandleFunc("/api/pipelines/", s.handlePipelineByID)
	mux.HandleFunc("/api/schema/infer", s.handleInferSchema)
	mux.HandleFunc("/api/mapping/preview", s.handlePreview)
	mux.HandleFunc("/api/http/", s.handleHTTPPipeline)
	return cors(mux)
}

func (s *Server) handlePipelines(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		items, err := s.store.List()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
	case http.MethodPost:
		definition, err := decodePipelineRequest(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if definition.Pipeline.ID == "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("pipeline id is required"))
			return
		}
		if err := s.store.Save(definition); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, definition)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handlePipelineByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/pipelines/")
	if strings.HasSuffix(path, "/test") {
		id := strings.TrimSuffix(path, "/test")
		s.handleTestPipeline(id, w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	definition, err := s.store.Get(path)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, definition)
}

func (s *Server) handleTestPipeline(id string, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	definition, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	request := struct {
		SamplePayload string `json:"samplePayload"`
	}{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	preview, err := s.executor.RunPreview(r.Context(), definition, []byte(request.SamplePayload))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (s *Server) handleHTTPPipeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/http/")
	definition, err := s.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if strings.ToLower(definition.Source.Type) != "http" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("pipeline %q is not configured with an http source", id))
		return
	}

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	preview, err := s.executor.RunPreview(r.Context(), definition, payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if shouldReplyInline(definition.Target.Config) {
		w.Header().Set("Content-Type", contentTypeForFormat(definition.Target.Format))
		w.Header().Set("X-PipeWeaver-Pipeline", definition.Pipeline.ID)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(preview.EncodedOutput))
		return
	}

	writeJSON(w, http.StatusOK, preview)
}

func (s *Server) handleInferSchema(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	request := struct {
		Format string `json:"format"`
		Sample string `json:"sample"`
	}{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	definition, err := inferSchema(request.Format, request.Sample)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, definition)
}

func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	request := struct {
		Pipeline      pipeline.Definition `json:"pipeline"`
		SamplePayload string              `json:"samplePayload"`
	}{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	preview, err := s.executor.RunPreview(r.Context(), request.Pipeline, []byte(request.SamplePayload))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func inferSchema(format, sample string) (schema.Definition, error) {
	if format == "csv" || format == "tsv" || format == "pipe" || format == "pipe-delimited" {
		reader := csv.NewReader(strings.NewReader(sample))
		switch format {
		case "tsv":
			reader.Comma = '\t'
		case "pipe", "pipe-delimited":
			reader.Comma = '|'
		}
		rows, err := reader.ReadAll()
		if err != nil {
			return schema.Definition{}, err
		}
		if len(rows) == 0 {
			return schema.Definition{Type: schema.TypeObject}, nil
		}
		return schema.InferFromDelimitedHeaders(rows[0]), nil
	}
	decoder, err := formats.NewDecoder(format)
	if err != nil {
		return schema.Definition{}, err
	}
	records, err := decoder.Decode(context.Background(), []byte(sample))
	if err != nil {
		return schema.Definition{}, err
	}
	definition := schema.InferFromRecords(records)
	definition.JSONSchema = schema.ToJSONSchema(definition)
	if format == "xml" {
		definition.XSDNote = "XSD import/export is scaffolded for a future release."
	}
	return definition, nil
}

func decodePipelineRequest(body io.Reader) (pipeline.Definition, error) {
	payload, err := io.ReadAll(body)
	if err != nil {
		return pipeline.Definition{}, err
	}
	return pipeline.Parse(payload)
}

func shouldReplyInline(config map[string]any) bool {
	if config == nil {
		return false
	}
	if responseMode, ok := config["responseMode"].(string); ok {
		return strings.EqualFold(responseMode, "reply") || strings.EqualFold(responseMode, "inline")
	}
	if replyInline, ok := config["respondToSource"].(bool); ok {
		return replyInline
	}
	return false
}

func contentTypeForFormat(format string) string {
	switch strings.ToLower(format) {
	case "json":
		return "application/json"
	case "xml":
		return "application/xml"
	case "csv":
		return "text/csv"
	case "tsv":
		return "text/tab-separated-values"
	default:
		return "text/plain"
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
