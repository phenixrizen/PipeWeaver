package formats

import (
	"context"
	"strings"
	"testing"
)

// TestJSONRoundTrip validates JSON decoding and encoding of canonical records.
func TestJSONRoundTrip(t *testing.T) {
	decoder := JSONDecoder{}
	records, err := decoder.Decode(context.Background(), []byte(`[{"name":"Alice"}]`))
	if err != nil {
		t.Fatalf("decode json: %v", err)
	}
	if len(records) != 1 || records[0]["name"] != "Alice" {
		t.Fatalf("unexpected records: %#v", records)
	}
	encoder := JSONEncoder{}
	payload, err := encoder.Encode(context.Background(), records)
	if err != nil {
		t.Fatalf("encode json: %v", err)
	}
	if !strings.Contains(string(payload), "Alice") {
		t.Fatalf("unexpected payload: %s", payload)
	}
}

// TestDelimitedRoundTrip validates delimited format support.
func TestDelimitedRoundTrip(t *testing.T) {
	decoder := DelimitedDecoder{Delimiter: ','}
	records, err := decoder.Decode(context.Background(), []byte("id,name\n1,Alice\n"))
	if err != nil {
		t.Fatalf("decode csv: %v", err)
	}
	if len(records) != 1 || records[0]["id"] != "1" {
		t.Fatalf("unexpected records: %#v", records)
	}
	encoder := DelimitedEncoder{Delimiter: ','}
	payload, err := encoder.Encode(context.Background(), records)
	if err != nil {
		t.Fatalf("encode csv: %v", err)
	}
	if !strings.Contains(string(payload), "Alice") {
		t.Fatalf("unexpected payload: %s", payload)
	}
}

// TestXMLDecode validates basic XML conversion into canonical records.
func TestXMLDecode(t *testing.T) {
	decoder := XMLDecoder{}
	records, err := decoder.Decode(context.Background(), []byte(`<orders><order><id>1</id></order></orders>`))
	if err != nil {
		t.Fatalf("decode xml: %v", err)
	}
	value, ok := GetPath(records[0], "order.id")
	if !ok || value != "1" {
		t.Fatalf("unexpected xml path value: %v %v", value, ok)
	}
}
