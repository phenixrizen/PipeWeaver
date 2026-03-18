package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

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

// SeedFromDir copies pipeline definitions from a source directory into the store.
// Existing stored pipeline IDs are preserved so local edits are not overwritten.
func (s *FilesystemStore) SeedFromDir(sourceRoot string) (int, error) {
	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		return 0, fmt.Errorf("read seed source: %w", err)
	}

	seeded := 0
	for _, entry := range entries {
		if entry.IsDir() || !isPipelineDefinitionFile(entry.Name()) {
			continue
		}

		definition, err := pipeline.LoadFile(filepath.Join(sourceRoot, entry.Name()))
		if err != nil {
			return seeded, fmt.Errorf("load seed pipeline %q: %w", entry.Name(), err)
		}
		if definition.Pipeline.ID == "" {
			return seeded, fmt.Errorf("seed pipeline %q is missing a pipeline id", entry.Name())
		}

		targetPath := filepath.Join(s.Root, definition.Pipeline.ID+".yaml")
		if _, err := os.Stat(targetPath); err == nil {
			continue
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			return seeded, fmt.Errorf("check existing seeded pipeline %q: %w", definition.Pipeline.ID, err)
		}

		if err := s.Save(definition); err != nil {
			return seeded, fmt.Errorf("save seeded pipeline %q: %w", definition.Pipeline.ID, err)
		}
		seeded++
	}

	return seeded, nil
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

func isPipelineDefinitionFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".yaml" || ext == ".yml" || ext == ".json"
}
