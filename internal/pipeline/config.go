package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/mapping"
	"github.com/phenixrizen/PipeWeaver/internal/schema"
	"gopkg.in/yaml.v3"
)

// Metadata captures the pipeline identity and descriptive information.
type Metadata struct {
	ID          string `json:"id" yaml:"id"`
	Name        string `json:"name" yaml:"name"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

// ConnectorConfig describes a source or target connector instance.
type ConnectorConfig struct {
	Type   string         `json:"type" yaml:"type"`
	Format string         `json:"format" yaml:"format"`
	Config map[string]any `json:"config,omitempty" yaml:"config,omitempty"`
}

// Definition is the root serializable pipeline object.
type Definition struct {
	Pipeline     Metadata           `json:"pipeline" yaml:"pipeline"`
	Source       ConnectorConfig    `json:"source" yaml:"source"`
	Target       ConnectorConfig    `json:"target" yaml:"target"`
	Mapping      mapping.Spec       `json:"mapping" yaml:"mapping"`
	TargetSchema *schema.Definition `json:"targetSchema,omitempty" yaml:"targetSchema,omitempty"`
}

// Parse converts YAML or JSON pipeline definitions into a typed Definition.
func Parse(payload []byte) (Definition, error) {
	definition := Definition{}
	trimmed := strings.TrimSpace(string(payload))
	if strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal(payload, &definition); err != nil {
			return Definition{}, fmt.Errorf("parse pipeline json: %w", err)
		}
		return definition, nil
	}
	if err := yaml.Unmarshal(payload, &definition); err != nil {
		return Definition{}, fmt.Errorf("parse pipeline yaml: %w", err)
	}
	return definition, nil
}

// LoadFile loads a pipeline definition from disk.
func LoadFile(path string) (Definition, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return Definition{}, fmt.Errorf("read pipeline file: %w", err)
	}
	return Parse(payload)
}

// Marshal serializes the definition as JSON or YAML based on the file extension.
func Marshal(definition Definition, path string) ([]byte, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json":
		return json.MarshalIndent(definition, "", "  ")
	default:
		return yaml.Marshal(definition)
	}
}
