package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/phenixrizen/PipeWeaver/internal/mapping"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
	"gopkg.in/yaml.v3"
)

// ConnectorConfig configures a source or target connector instance.
type ConnectorConfig struct {
	Type   string         `json:"type" yaml:"type"`
	Format string         `json:"format" yaml:"format"`
	Config map[string]any `json:"config,omitempty" yaml:"config,omitempty"`
}

// Definition is the top-level declarative pipeline document.
type Definition struct {
	ID           string             `json:"id" yaml:"id"`
	Name         string             `json:"name" yaml:"name"`
	Description  string             `json:"description,omitempty" yaml:"description,omitempty"`
	Source       ConnectorConfig    `json:"source" yaml:"source"`
	Target       ConnectorConfig    `json:"target" yaml:"target"`
	SourceSchema *schema.Definition `json:"sourceSchema,omitempty" yaml:"sourceSchema,omitempty"`
	TargetSchema *schema.Definition `json:"targetSchema,omitempty" yaml:"targetSchema,omitempty"`
	Mapping      mapping.Definition `json:"mapping" yaml:"mapping"`
	SampleInput  string             `json:"sampleInput,omitempty" yaml:"sampleInput,omitempty"`
}

// LoadFile reads a JSON or YAML pipeline definition from disk.
func LoadFile(path string) (*Definition, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read pipeline: %w", err)
	}
	return Parse(path, payload)
}

// Parse decodes a pipeline definition from JSON or YAML based on file extension or content.
func Parse(name string, payload []byte) (*Definition, error) {
	definition := &Definition{}
	ext := filepath.Ext(name)
	switch ext {
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(payload, definition); err != nil {
			return nil, fmt.Errorf("parse yaml pipeline: %w", err)
		}
	default:
		if err := json.Unmarshal(payload, definition); err != nil {
			if err := yaml.Unmarshal(payload, definition); err != nil {
				return nil, fmt.Errorf("parse pipeline: %w", err)
			}
		}
	}
	return definition, nil
}

// MarshalJSONFile writes a pipeline as a normalized JSON document.
func MarshalJSONFile(definition *Definition) ([]byte, error) {
	return json.MarshalIndent(definition, "", "  ")
}
