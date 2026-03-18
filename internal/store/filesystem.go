package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

// FilesystemStore persists pipeline definitions as YAML files for the MVP.
type FilesystemStore struct {
	Root string
}

// NewFilesystemStore creates the directory if it does not exist.
func NewFilesystemStore(root string) (*FilesystemStore, error) {
	if root == "" {
		root = ".pipeweaver/pipelines"
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("create store root: %w", err)
	}
	return &FilesystemStore{Root: root}, nil
}

// Save writes a pipeline definition to the store.
func (s *FilesystemStore) Save(definition pipeline.Definition) error {
	path := filepath.Join(s.Root, definition.Pipeline.ID+".yaml")
	payload, err := pipeline.Marshal(definition, path)
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o644)
}

// List returns all stored pipeline definitions sorted by ID.
func (s *FilesystemStore) List() ([]pipeline.Definition, error) {
	entries, err := os.ReadDir(s.Root)
	if err != nil {
		return nil, fmt.Errorf("read store root: %w", err)
	}
	items := make([]pipeline.Definition, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		definition, err := pipeline.LoadFile(filepath.Join(s.Root, entry.Name()))
		if err != nil {
			return nil, err
		}
		items = append(items, definition)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Pipeline.ID < items[j].Pipeline.ID })
	return items, nil
}

// Get loads a single stored pipeline by ID.
func (s *FilesystemStore) Get(id string) (pipeline.Definition, error) {
	return pipeline.LoadFile(filepath.Join(s.Root, id+".yaml"))
}
