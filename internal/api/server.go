package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
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

// Routes configures the REST API with Gin, request logging, recovery, and permissive CORS for local development.
func (s *Server) Routes() http.Handler {
	engine := gin.New()
	engine.HandleMethodNotAllowed = true
	engine.Use(gin.Logger(), gin.Recovery(), cors())

	engine.GET("/api/pipelines", s.handleListPipelines)
	engine.POST("/api/pipelines", s.handleCreatePipeline)
	engine.GET("/api/pipelines/:id", s.handleGetPipeline)
	engine.DELETE("/api/pipelines/:id", s.handleDeletePipeline)
	engine.POST("/api/pipelines/:id/test", s.handleTestPipeline)
	engine.POST("/api/schema/infer", s.handleInferSchema)
	engine.POST("/api/mapping/preview", s.handlePreview)
	engine.POST("/api/http/:id", s.handleHTTPPipeline)

	return engine
}

func (s *Server) handleListPipelines(c *gin.Context) {
	items, err := s.store.List()
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}

	writeJSON(c, http.StatusOK, items)
}

func (s *Server) handleCreatePipeline(c *gin.Context) {
	definition, err := decodePipelineRequest(c.Request.Body)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	if definition.Pipeline.ID == "" {
		writeError(c, http.StatusBadRequest, fmt.Errorf("pipeline id is required"))
		return
	}

	if err := s.store.Save(definition); err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}

	writeJSON(c, http.StatusCreated, definition)
}

func (s *Server) handleGetPipeline(c *gin.Context) {
	definition, err := s.store.Get(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusNotFound, err)
		return
	}

	writeJSON(c, http.StatusOK, definition)
}

func (s *Server) handleDeletePipeline(c *gin.Context) {
	id := c.Param("id")
	if err := s.store.Delete(id); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(c, http.StatusNotFound, err)
			return
		}

		writeError(c, http.StatusInternalServerError, err)
		return
	}

	writeJSON(c, http.StatusOK, map[string]any{
		"deleted": true,
		"id":      id,
	})
}

func (s *Server) handleTestPipeline(c *gin.Context) {
	definition, err := s.store.Get(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusNotFound, err)
		return
	}

	request := struct {
		SamplePayload string `json:"samplePayload"`
	}{}
	if err := json.NewDecoder(c.Request.Body).Decode(&request); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	preview, err := s.executor.RunPreview(c.Request.Context(), definition, []byte(request.SamplePayload))
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	writeJSON(c, http.StatusOK, preview)
}

func (s *Server) handleHTTPPipeline(c *gin.Context) {
	id := c.Param("id")
	definition, err := s.store.Get(id)
	if err != nil {
		writeError(c, http.StatusNotFound, err)
		return
	}
	if strings.ToLower(definition.Source.Type) != "http" {
		writeError(c, http.StatusBadRequest, fmt.Errorf("pipeline %q is not configured with an http source", id))
		return
	}

	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	preview, err := s.executor.RunPreview(c.Request.Context(), definition, payload)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	if shouldReplyInline(definition.Target.Config) {
		c.Header("X-PipeWeaver-Pipeline", definition.Pipeline.ID)
		c.Data(http.StatusOK, contentTypeForFormat(definition.Target.Format), []byte(preview.EncodedOutput))
		return
	}

	writeJSON(c, http.StatusOK, preview)
}

func (s *Server) handleInferSchema(c *gin.Context) {
	request := struct {
		Format string `json:"format"`
		Sample string `json:"sample"`
	}{}
	if err := json.NewDecoder(c.Request.Body).Decode(&request); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	definition, err := inferSchema(request.Format, request.Sample)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	writeJSON(c, http.StatusOK, definition)
}

func (s *Server) handlePreview(c *gin.Context) {
	request := struct {
		Pipeline      pipeline.Definition `json:"pipeline"`
		SamplePayload string              `json:"samplePayload"`
	}{}
	if err := json.NewDecoder(c.Request.Body).Decode(&request); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	preview, err := s.executor.RunPreview(c.Request.Context(), request.Pipeline, []byte(request.SamplePayload))
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}

	writeJSON(c, http.StatusOK, preview)
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

func writeJSON(c *gin.Context, status int, value any) {
	c.JSON(status, value)
}

func writeError(c *gin.Context, status int, err error) {
	writeJSON(c, status, map[string]any{"error": err.Error()})
}

func cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		c.Header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.Status(http.StatusNoContent)
			c.Abort()
			return
		}

		c.Next()
	}
}
