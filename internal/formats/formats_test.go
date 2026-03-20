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

func TestDelimitedEncodeLeavesNilValuesBlankWhenConfigured(t *testing.T) {
	encoder := DelimitedEncoder{
		Delimiter:  ',',
		NilAsEmpty: true,
		Columns: []DelimitedColumn{
			{Key: "customer_id", Header: "customer_id"},
			{Key: "full_name", Header: "full_name"},
			{Key: "amount", Header: "amount"},
		},
	}

	payload, err := encoder.Encode(context.Background(), []Record{
		{
			"customer_id": "1001",
			"full_name":   nil,
			"amount":      nil,
		},
	})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}

	if string(payload) != "customer_id,full_name,amount\n1001,,\n" {
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

func TestGetPathTraversesIntermediateArrays(t *testing.T) {
	record := Record{
		"claim": map[string]any{
			"services": map[string]any{
				"service": []any{
					map[string]any{"lineNumber": "1", "procedureCode": "97153"},
					map[string]any{"lineNumber": "2", "procedureCode": "97155"},
				},
			},
		},
	}

	value, ok := GetPath(record, "claim.services.service.lineNumber")
	if !ok {
		t.Fatal("expected path through array to resolve")
	}

	items, ok := value.([]any)
	if !ok {
		t.Fatalf("expected flattened []any, got %#v", value)
	}
	if len(items) != 2 || items[0] != "1" || items[1] != "2" {
		t.Fatalf("unexpected flattened values: %#v", items)
	}
}

func TestGetPathSupportsOneBasedIndexes(t *testing.T) {
	record := Record{
		"claim": map[string]any{
			"diagnoses": map[string]any{
				"diagnosis": []any{
					map[string]any{"codeValue": "F84.0"},
					map[string]any{"codeValue": "E11.9"},
				},
			},
		},
	}

	first, ok := GetPath(record, "claim.diagnoses.diagnosis[1].codeValue")
	if !ok || first != "F84.0" {
		t.Fatalf("unexpected first indexed value: %#v %v", first, ok)
	}

	second, ok := GetPath(record, "claim.diagnoses.diagnosis[2].codeValue")
	if !ok || second != "E11.9" {
		t.Fatalf("unexpected second indexed value: %#v %v", second, ok)
	}
}

func TestGetPathTreatsIndexOneAsSingularFallback(t *testing.T) {
	record := Record{
		"claim": map[string]any{
			"diagnoses": map[string]any{
				"diagnosis": map[string]any{"codeValue": "F84.0"},
			},
		},
	}

	value, ok := GetPath(record, "claim.diagnoses.diagnosis[1].codeValue")
	if !ok || value != "F84.0" {
		t.Fatalf("unexpected singular indexed value: %#v %v", value, ok)
	}

	if _, ok := GetPath(record, "claim.diagnoses.diagnosis[2].codeValue"); ok {
		t.Fatal("expected index 2 on a singular value to fail")
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

func TestJSONEncodeOmitsNilValuesWhenConfigured(t *testing.T) {
	encoder := JSONEncoder{OmitNilValues: true}
	payload, err := encoder.Encode(context.Background(), []Record{
		{
			"customer": map[string]any{
				"id":   "1001",
				"name": nil,
			},
			"note": nil,
		},
	})
	if err != nil {
		t.Fatalf("json encode failed: %v", err)
	}

	output := string(payload)
	if strings.Contains(output, "\"note\"") || strings.Contains(output, "\"name\"") {
		t.Fatalf("expected nil json fields to be omitted, got %s", output)
	}
	if !strings.Contains(output, "\"id\": \"1001\"") {
		t.Fatalf("expected non-nil json field to remain, got %s", output)
	}
}

func TestXMLEncodeOmitsNilValuesWhenConfigured(t *testing.T) {
	encoder := XMLEncoder{RootName: "records", ItemName: "order", OmitNilValues: true}
	payload, err := encoder.Encode(context.Background(), []Record{
		{
			"customer": map[string]any{
				"id":   "500",
				"name": nil,
			},
			"note": nil,
		},
	})
	if err != nil {
		t.Fatalf("xml encode failed: %v", err)
	}

	output := string(payload)
	if strings.Contains(output, "<note>") || strings.Contains(output, "<name>") {
		t.Fatalf("expected nil xml fields to be omitted, got %s", output)
	}
	if !strings.Contains(output, "<customer><id>500</id></customer>") {
		t.Fatalf("expected non-nil xml field to remain, got %s", output)
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
