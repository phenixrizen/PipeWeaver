package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// PipelineStore persists declarative pipeline definitions.
type PipelineStore interface {
	Save(definition *pipeline.Definition) error
	List() ([]*pipeline.Definition, error)
	Get(id string) (*pipeline.Definition, error)
}

// FilesystemStore stores pipelines as JSON files under a root directory.
type FilesystemStore struct {
	Root string
}

// Save writes a pipeline definition as JSON.
func (store FilesystemStore) Save(definition *pipeline.Definition) error {
	if err := os.MkdirAll(store.Root, 0o755); err != nil {
		return fmt.Errorf("create store root: %w", err)
	}
	payload, err := pipeline.MarshalJSONFile(definition)
	if err != nil {
		return err
	}
	path := filepath.Join(store.Root, definition.ID+".json")
	return os.WriteFile(path, payload, 0o644)
}

// List returns every stored pipeline.
func (store FilesystemStore) List() ([]*pipeline.Definition, error) {
	entries, err := os.ReadDir(store.Root)
	if err != nil {
		if os.IsNotExist(err) {
			return []*pipeline.Definition{}, nil
		}
		return nil, err
	}
	definitions := make([]*pipeline.Definition, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		definition, err := pipeline.LoadFile(filepath.Join(store.Root, entry.Name()))
		if err != nil {
			return nil, err
		}
		definitions = append(definitions, definition)
	}
	sort.Slice(definitions, func(i, j int) bool {
		return definitions[i].ID < definitions[j].ID
	})
	return definitions, nil
}

// Get loads a single pipeline by ID.
func (store FilesystemStore) Get(id string) (*pipeline.Definition, error) {
	return pipeline.LoadFile(filepath.Join(store.Root, id+".json"))
}
