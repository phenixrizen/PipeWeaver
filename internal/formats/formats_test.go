package formats

import (
	"context"
	"strings"
	"testing"
)

func TestDelimitedDecodeEncode(t *testing.T) {
	decoder := DelimitedDecoder{Delimiter: ','}
	records, err := decoder.Decode(context.Background(), []byte("id,name\n1,Ada\n2,Linus\n"))
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(records) != 2 || records[0]["name"] != "Ada" {
		t.Fatalf("unexpected decoded records: %#v", records)
	}

	encoder := DelimitedEncoder{Delimiter: ','}
	payload, err := encoder.Encode(context.Background(), records)
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	if !strings.Contains(string(payload), "id,name") {
		t.Fatalf("unexpected encoded payload: %s", string(payload))
	}
}

func TestPathHelpers(t *testing.T) {
	record := Record{}
	if err := SetPath(record, "customer.name", "Ada"); err != nil {
		t.Fatalf("set path failed: %v", err)
	}
	value, ok := GetPath(record, "customer.name")
	if !ok || value != "Ada" {
		t.Fatalf("unexpected path value: %#v %v", value, ok)
	}
}
