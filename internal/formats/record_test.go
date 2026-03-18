package formats

import "testing"

// TestPathHelpers ensures canonical path reads and writes work for nested records.
func TestPathHelpers(t *testing.T) {
	record := Record{}
	if err := SetPath(record, "customer.id", "1001"); err != nil {
		t.Fatalf("set path: %v", err)
	}
	value, ok := GetPath(record, "customer.id")
	if !ok || value != "1001" {
		t.Fatalf("unexpected value: %v %v", value, ok)
	}
}
