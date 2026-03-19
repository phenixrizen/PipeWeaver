package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSeedFromDirOverwritesExistingPipelinesByID(t *testing.T) {
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
	if seeded != 2 {
		t.Fatalf("expected 2 seeded pipelines, got %d", seeded)
	}

	items, err := store.List()
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 stored pipelines, got %d", len(items))
	}
	if items[0].Pipeline.Name != "Alpha" {
		t.Fatalf("expected existing pipeline to be overwritten, got %q", items[0].Pipeline.Name)
	}
	if items[1].Pipeline.ID != "beta" {
		t.Fatalf("expected beta to be seeded, got %q", items[1].Pipeline.ID)
	}
}

func TestSeedFromDirCopiesAssetsAndRewritesExamplePaths(t *testing.T) {
	store, err := NewFilesystemStore(filepath.Join(t.TempDir(), "pipelines"))
	if err != nil {
		t.Fatalf("new filesystem store failed: %v", err)
	}

	exampleRoot := filepath.Join(t.TempDir(), "examples")
	seedRoot := filepath.Join(exampleRoot, "pipelines")
	inputRoot := filepath.Join(exampleRoot, "inputs")
	outputRoot := filepath.Join(exampleRoot, "outputs")

	for _, dir := range []string{seedRoot, inputRoot, outputRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("create %s failed: %v", dir, err)
		}
	}

	if err := os.WriteFile(filepath.Join(inputRoot, "claim.xml"), []byte("<envelope><claim><name>Bob</name></claim></envelope>"), 0o644); err != nil {
		t.Fatalf("write input asset failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outputRoot, "claim.csv"), []byte("name\nBob\n"), 0o644); err != nil {
		t.Fatalf("write output asset failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(seedRoot, "claim.yaml"), []byte(`pipeline:
  id: claim
  name: Claim
source:
  type: file
  format: xml
  config:
    path: examples/inputs/claim.xml
target:
  type: file
  format: csv
  config:
    path: examples/outputs/claim.csv
mapping:
  fields:
    - from: claim.name
      to: name
`), 0o644); err != nil {
		t.Fatalf("write seed pipeline failed: %v", err)
	}

	if _, err := store.SeedFromDir(seedRoot); err != nil {
		t.Fatalf("seed from dir failed: %v", err)
	}

	definition, err := store.Get("claim")
	if err != nil {
		t.Fatalf("get seeded pipeline failed: %v", err)
	}

	expectedInputPath := filepath.Join(filepath.Dir(store.Root), "examples", "inputs", "claim.xml")
	expectedOutputPath := filepath.Join(filepath.Dir(store.Root), "examples", "outputs", "claim.csv")

	if definition.Source.Config["path"] != expectedInputPath {
		t.Fatalf("expected rewritten source path %q, got %#v", expectedInputPath, definition.Source.Config["path"])
	}
	if definition.Target.Config["path"] != expectedOutputPath {
		t.Fatalf("expected rewritten target path %q, got %#v", expectedOutputPath, definition.Target.Config["path"])
	}
	if definition.Source.Config["samplePayload"] != "<envelope><claim><name>Bob</name></claim></envelope>" {
		t.Fatalf("expected hydrated sample payload, got %#v", definition.Source.Config["samplePayload"])
	}
	if definition.Target.Config["sampleOutput"] != "name\nBob\n" {
		t.Fatalf("expected hydrated sample output, got %#v", definition.Target.Config["sampleOutput"])
	}

	if _, err := os.Stat(expectedInputPath); err != nil {
		t.Fatalf("expected copied input asset at %s: %v", expectedInputPath, err)
	}
	if _, err := os.Stat(expectedOutputPath); err != nil {
		t.Fatalf("expected copied output asset at %s: %v", expectedOutputPath, err)
	}
}
