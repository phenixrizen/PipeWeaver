package formats

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// XMLDecoder converts simple XML payloads into canonical records by walking element trees.
type XMLDecoder struct{}

// Decode handles either a single root object or a collection of repeated child elements.
func (d XMLDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	decoder := xml.NewDecoder(bytes.NewReader(payload))
	stack := []string{}
	record := Record{}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("decode xml: %w", err)
		}

		switch typed := token.(type) {
		case xml.StartElement:
			stack = append(stack, typed.Name.Local)
		case xml.EndElement:
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
		case xml.CharData:
			value := strings.TrimSpace(string(typed))
			if value == "" || len(stack) < 2 {
				continue
			}
			path := strings.Join(stack[1:], ".")
			if err := SetPath(record, path, value); err != nil {
				return nil, err
			}
		}
	}
	return []Record{record}, nil
}

// XMLEncoder writes a simple XML document from canonical records.
type XMLEncoder struct {
	RootName string
	ItemName string
}

// Encode creates a lightweight XML representation that is sufficient for preview and example use cases.
func (e XMLEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	root := e.RootName
	if root == "" {
		root = "records"
	}
	item := e.ItemName
	if item == "" {
		item = "record"
	}

	buffer := &bytes.Buffer{}
	buffer.WriteString(xml.Header)
	buffer.WriteString("<" + root + ">")
	for _, record := range records {
		buffer.WriteString("<" + item + ">")
		for key, value := range record {
			buffer.WriteString("<" + key + ">")
			if err := xml.EscapeText(buffer, []byte(fmt.Sprint(value))); err != nil {
				return nil, fmt.Errorf("escape xml text: %w", err)
			}
			buffer.WriteString("</" + key + ">")
		}
		buffer.WriteString("</" + item + ">")
	}
	buffer.WriteString("</" + root + ">")
	return buffer.Bytes(), nil
}
