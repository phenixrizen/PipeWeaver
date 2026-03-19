package formats

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"sort"
	"strings"
)

// XMLDecoder converts simple XML payloads into canonical records by walking element trees.
type XMLDecoder struct{}

// Decode handles either a single root object or a collection of repeated child elements.
func (d XMLDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	root := xmlNode{}
	if err := xml.Unmarshal(payload, &root); err != nil {
		return nil, fmt.Errorf("decode xml: %w", err)
	}

	if len(root.Children) == 0 {
		value := strings.TrimSpace(root.Content)
		if value == "" {
			return []Record{{}}, nil
		}
		return []Record{{root.XMLName.Local: value}}, nil
	}

	return []Record{nodeChildrenToRecord(root.Children)}, nil
}

type xmlNode struct {
	XMLName  xml.Name  `xml:""`
	Content  string    `xml:",chardata"`
	Children []xmlNode `xml:",any"`
}

func nodeChildrenToRecord(children []xmlNode) Record {
	values := groupChildValues(children)
	record := Record{}
	for key, value := range values {
		record[key] = value
	}
	return record
}

func groupChildValues(children []xmlNode) map[string]any {
	grouped := make(map[string][]any)
	order := make([]string, 0)

	for _, child := range children {
		name := child.XMLName.Local
		if _, exists := grouped[name]; !exists {
			order = append(order, name)
		}
		grouped[name] = append(grouped[name], nodeToValue(child))
	}

	values := make(map[string]any, len(grouped))
	for _, name := range order {
		items := grouped[name]
		if len(items) == 1 {
			values[name] = items[0]
			continue
		}
		values[name] = items
	}
	return values
}

func nodeToValue(node xmlNode) any {
	if len(node.Children) == 0 {
		return strings.TrimSpace(node.Content)
	}
	return groupChildValues(node.Children)
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
		if err := encodeXMLMap(buffer, map[string]any(record)); err != nil {
			return nil, err
		}
		buffer.WriteString("</" + item + ">")
	}
	buffer.WriteString("</" + root + ">")
	return buffer.Bytes(), nil
}

func encodeXMLMap(buffer *bytes.Buffer, values map[string]any) error {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		if err := encodeXMLValue(buffer, key, values[key]); err != nil {
			return err
		}
	}
	return nil
}

func encodeXMLValue(buffer *bytes.Buffer, key string, value any) error {
	switch typed := value.(type) {
	case Record:
		buffer.WriteString("<" + key + ">")
		if err := encodeXMLMap(buffer, map[string]any(typed)); err != nil {
			return err
		}
		buffer.WriteString("</" + key + ">")
		return nil
	case map[string]any:
		buffer.WriteString("<" + key + ">")
		if err := encodeXMLMap(buffer, typed); err != nil {
			return err
		}
		buffer.WriteString("</" + key + ">")
		return nil
	case []any:
		for _, item := range typed {
			if err := encodeXMLValue(buffer, key, item); err != nil {
				return err
			}
		}
		return nil
	default:
		buffer.WriteString("<" + key + ">")
		if err := xml.EscapeText(buffer, []byte(fmt.Sprint(value))); err != nil {
			return fmt.Errorf("escape xml text: %w", err)
		}
		buffer.WriteString("</" + key + ">")
		return nil
	}
}
