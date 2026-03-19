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

func TestDelimitedEncodeHonorsConfiguredColumns(t *testing.T) {
	encoder := DelimitedEncoder{
		Delimiter: ',',
		Columns: []DelimitedColumn{
			{Key: "customer_id", Header: "customer_id"},
			{Key: "full_name", Header: "full_name"},
			{Key: "amount", Header: "amount"},
		},
	}

	payload, err := encoder.Encode(context.Background(), []Record{
		{
			"amount":      "12.50",
			"full_name":   "Ada Lovelace",
			"customer_id": "1001",
		},
	})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}

	if string(payload) != "customer_id,full_name,amount\n1001,Ada Lovelace,12.50\n" {
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

func TestXMLEncodeNestedRecords(t *testing.T) {
	encoder := XMLEncoder{RootName: "records", ItemName: "order"}
	payload, err := encoder.Encode(context.Background(), []Record{
		{
			"customer": map[string]any{
				"id":   "500",
				"name": "Jane Doe",
			},
			"invoice": map[string]any{
				"amount":   "91.20",
				"currency": "USD",
			},
		},
	})
	if err != nil {
		t.Fatalf("xml encode failed: %v", err)
	}

	output := string(payload)
	if !strings.Contains(output, "<order>") || !strings.Contains(output, "<customer><id>500</id><name>Jane Doe</name></customer>") {
		t.Fatalf("unexpected xml payload: %s", output)
	}
	if !strings.Contains(output, "<invoice><amount>91.20</amount><currency>USD</currency></invoice>") {
		t.Fatalf("unexpected xml payload: %s", output)
	}
}

func TestXMLDecodePreservesRepeatedElementsAsArrays(t *testing.T) {
	decoder := XMLDecoder{}
	records, err := decoder.Decode(
		context.Background(),
		[]byte("<envelope><claim><name>Bob</name><codes><code>1</code><code>2</code></codes></claim></envelope>"),
	)
	if err != nil {
		t.Fatalf("decode xml failed: %v", err)
	}

	claim, ok := records[0]["claim"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested claim object, got %#v", records[0]["claim"])
	}
	codes, ok := claim["codes"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested codes object, got %#v", claim["codes"])
	}
	codeValues, ok := codes["code"].([]any)
	if !ok {
		t.Fatalf("expected repeated code elements to decode as []any, got %#v", codes["code"])
	}
	if len(codeValues) != 2 || codeValues[0] != "1" || codeValues[1] != "2" {
		t.Fatalf("unexpected repeated values: %#v", codeValues)
	}
}
