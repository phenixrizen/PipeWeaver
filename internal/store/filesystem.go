package store

import (
	"fmt"
	"io"
	"io/fs"
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
// Existing stored pipeline IDs are overwritten so refreshed built-in examples replace stale local copies.
func (s *FilesystemStore) SeedFromDir(sourceRoot string) (int, error) {
	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		return 0, fmt.Errorf("read seed source: %w", err)
	}

	sourceBase := filepath.Dir(sourceRoot)
	seededExamplesRoot := filepath.Join(filepath.Dir(s.Root), "examples")
	if err := copySeedAssets(filepath.Join(sourceBase, "inputs"), filepath.Join(seededExamplesRoot, "inputs")); err != nil {
		return 0, fmt.Errorf("copy seed inputs: %w", err)
	}
	if err := copySeedAssets(filepath.Join(sourceBase, "outputs"), filepath.Join(seededExamplesRoot, "outputs")); err != nil {
		return 0, fmt.Errorf("copy seed outputs: %w", err)
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
		if err := hydrateSeedDefinition(&definition, sourceBase, seededExamplesRoot); err != nil {
			return seeded, fmt.Errorf("hydrate seeded pipeline %q: %w", definition.Pipeline.ID, err)
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

// Delete removes a stored pipeline definition by ID.
func (s *FilesystemStore) Delete(id string) error {
	entries, err := os.ReadDir(s.Root)
	if err != nil {
		return fmt.Errorf("read store root: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !isPipelineDefinitionFile(entry.Name()) {
			continue
		}

		entryID := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		if entryID != id {
			continue
		}

		if err := os.Remove(filepath.Join(s.Root, entry.Name())); err != nil {
			return fmt.Errorf("delete pipeline %q: %w", id, err)
		}
		return nil
	}

	return &fs.PathError{
		Op:   "delete",
		Path: filepath.Join(s.Root, id+".yaml"),
		Err:  fs.ErrNotExist,
	}
}

func isPipelineDefinitionFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".yaml" || ext == ".yml" || ext == ".json"
}

func copySeedAssets(sourceRoot string, targetRoot string) error {
	info, err := os.Stat(sourceRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return nil
	}

	return filepath.WalkDir(sourceRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relativePath, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(targetRoot, relativePath)

		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		sourceFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer sourceFile.Close()

		targetFile, err := os.Create(targetPath)
		if err != nil {
			return err
		}
		defer targetFile.Close()

		if _, err := io.Copy(targetFile, sourceFile); err != nil {
			return err
		}

		return os.Chmod(targetPath, 0o644)
	})
}

func hydrateSeedDefinition(definition *pipeline.Definition, sourceBase string, seededExamplesRoot string) error {
	if definition.Source.Config == nil {
		definition.Source.Config = map[string]any{}
	}
	if definition.Target.Config == nil {
		definition.Target.Config = map[string]any{}
	}

	if sourcePath, ok := definition.Source.Config["path"].(string); ok && strings.TrimSpace(sourcePath) != "" {
		resolvedSourcePath := resolveSeedSourcePath(sourcePath, sourceBase)
		if definition.Source.Type == "file" {
			if sample, ok := definition.Source.Config["samplePayload"].(string); !ok || strings.TrimSpace(sample) == "" {
				payload, err := os.ReadFile(resolvedSourcePath)
				if err != nil {
					return fmt.Errorf("read seed source sample %q: %w", resolvedSourcePath, err)
				}
				definition.Source.Config["samplePayload"] = string(payload)
			}
		}
		definition.Source.Config["path"] = rewriteSeededAssetPath(sourcePath, sourceBase, seededExamplesRoot)
	}

	if targetPath, ok := definition.Target.Config["path"].(string); ok && strings.TrimSpace(targetPath) != "" {
		definition.Target.Config["path"] = rewriteSeededAssetPath(targetPath, sourceBase, seededExamplesRoot)
		if sample, ok := definition.Target.Config["sampleOutput"].(string); (!ok || strings.TrimSpace(sample) == "") && isExampleAssetPath(targetPath, "outputs", sourceBase) {
			payload, err := os.ReadFile(resolveSeedSourcePath(targetPath, sourceBase))
			if err != nil {
				return fmt.Errorf("read seed target sample %q: %w", targetPath, err)
			}
			definition.Target.Config["sampleOutput"] = string(payload)
		}
	}

	return nil
}

func isExampleAssetPath(rawPath string, assetDir string, sourceBase string) bool {
	cleaned := filepath.Clean(rawPath)
	examplePrefix := filepath.Clean(filepath.Join("examples", assetDir))
	if cleaned == examplePrefix || strings.HasPrefix(cleaned, examplePrefix+string(os.PathSeparator)) {
		return true
	}
	absolutePrefix := filepath.Join(sourceBase, assetDir)
	return filepath.IsAbs(cleaned) && (cleaned == absolutePrefix || strings.HasPrefix(cleaned, absolutePrefix+string(os.PathSeparator)))
}

func resolveSeedSourcePath(rawPath string, sourceBase string) string {
	cleaned := filepath.Clean(rawPath)
	if filepath.IsAbs(cleaned) {
		return cleaned
	}

	for _, assetDir := range []string{"inputs", "outputs"} {
		examplePrefix := filepath.Clean(filepath.Join("examples", assetDir))
		if cleaned == examplePrefix || strings.HasPrefix(cleaned, examplePrefix+string(os.PathSeparator)) {
			relativePath, err := filepath.Rel(examplePrefix, cleaned)
			if err != nil {
				return cleaned
			}
			return filepath.Join(sourceBase, assetDir, relativePath)
		}
	}

	return cleaned
}

func rewriteSeededAssetPath(rawPath string, sourceBase string, seededExamplesRoot string) string {
	for _, assetDir := range []string{"inputs", "outputs"} {
		if !isExampleAssetPath(rawPath, assetDir, sourceBase) {
			continue
		}

		sourcePath := resolveSeedSourcePath(rawPath, sourceBase)
		relativePath, err := filepath.Rel(filepath.Join(sourceBase, assetDir), sourcePath)
		if err != nil {
			return rawPath
		}
		return filepath.Join(seededExamplesRoot, assetDir, relativePath)
	}

	return rawPath
}
