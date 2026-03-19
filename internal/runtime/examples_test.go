package runtime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/phenixrizen/PipeWeaver/internal/pipeline"
)

func TestClaimEnvelopeXMLExamplePreview(t *testing.T) {
	definitionPath := filepath.Join("..", "..", "examples", "pipelines", "xml_file_to_csv.json")
	inputPath := filepath.Join("..", "..", "examples", "inputs", "order.xml")

	definition, err := pipeline.LoadFile(definitionPath)
	if err != nil {
		t.Fatalf("load example pipeline failed: %v", err)
	}

	payload, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatalf("read example input failed: %v", err)
	}

	preview, err := Executor{}.RunPreview(context.Background(), definition, payload)
	if err != nil {
		t.Fatalf("run preview failed: %v", err)
	}

	if !strings.Contains(preview.EncodedOutput, "claim_id,claimant_name,member_id,plan_name,procedure_codes,claim_status,received_at,total_billed,currency") {
		t.Fatalf("expected claim csv headers, got %s", preview.EncodedOutput)
	}
	if !strings.Contains(preview.EncodedOutput, "\"CLM-2026-00045,Bob Stone,M-10045,Gold PPO,12345 | 67890,PENDING REVIEW,2026-03-18T09:15:00Z,184.22,USD\"") &&
		!strings.Contains(preview.EncodedOutput, "CLM-2026-00045,Bob Stone,M-10045,Gold PPO,12345 | 67890,PENDING REVIEW,2026-03-18T09:15:00Z,184.22,USD") {
		t.Fatalf("expected claim csv row, got %s", preview.EncodedOutput)
	}
}
