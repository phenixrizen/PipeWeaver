package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSeedFromDirCopiesMissingPipelinesWithoutOverwritingExistingOnes(t *testing.T) {
	store, err := NewFilesystemStore(t.TempDir())
	if err != nil {
		t.Fatalf("new filesystem store failed: %v", err)
	}

	seedRoot := filepath.Join(t.TempDir(), "seed")
	if err := os.MkdirAll(seedRoot, 0o755); err != nil {
		t.Fatalf("create seed dir failed: %v", err)
	}

	if err := os.WriteFile(filepath.Join(seedRoot, "alpha.yaml"), []byte(`pipeline:
  id: alpha
  name: Alpha
source:
  type: http
  format: csv
target:
  type: stdout
  format: json
mapping:
  fields:
    - from: id
      to: id
`), 0o644); err != nil {
		t.Fatalf("write alpha seed failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(seedRoot, "beta.json"), []byte(`{
  "pipeline": {"id": "beta", "name": "Beta"},
  "source": {"type": "http", "format": "csv"},
  "target": {"type": "stdout", "format": "json"},
  "mapping": {"fields": [{"from": "id", "to": "id"}]}
}`), 0o644); err != nil {
		t.Fatalf("write beta seed failed: %v", err)
	}

	if err := os.WriteFile(filepath.Join(store.Root, "alpha.yaml"), []byte(`pipeline:
  id: alpha
  name: Existing Alpha
source:
  type: http
  format: csv
target:
  type: stdout
  format: json
mapping:
  fields:
    - from: id
      to: id
`), 0o644); err != nil {
		t.Fatalf("write existing alpha failed: %v", err)
	}

	seeded, err := store.SeedFromDir(seedRoot)
	if err != nil {
		t.Fatalf("seed from dir failed: %v", err)
	}
	if seeded != 1 {
		t.Fatalf("expected 1 newly seeded pipeline, got %d", seeded)
	}

	items, err := store.List()
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 stored pipelines, got %d", len(items))
	}
	if items[0].Pipeline.Name != "Existing Alpha" {
		t.Fatalf("expected existing pipeline to be preserved, got %q", items[0].Pipeline.Name)
	}
	if items[1].Pipeline.ID != "beta" {
		t.Fatalf("expected beta to be seeded, got %q", items[1].Pipeline.ID)
	}
}
