package formats

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"strings"
)

// XMLDecoder parses a simple XML document into one or more canonical records.
type XMLDecoder struct{}

type xmlNode struct {
	XMLName  xml.Name
	Attrs    []xml.Attr `xml:",any,attr"`
	Children []xmlNode  `xml:",any"`
	Text     string     `xml:",chardata"`
}

// Decode converts XML bytes into records using element names as field names.
func (XMLDecoder) Decode(_ context.Context, payload []byte) ([]Record, error) {
	var root xmlNode
	if err := xml.Unmarshal(payload, &root); err != nil {
		return nil, fmt.Errorf("decode xml: %w", err)
	}

	if len(root.Children) == 0 {
		return []Record{{root.XMLName.Local: strings.TrimSpace(root.Text)}}, nil
	}

	records := make([]Record, 0, len(root.Children))
	for _, child := range root.Children {
		records = append(records, nodeToRecord(child))
	}
	return records, nil
}

// XMLEncoder serializes records into a lightweight XML document.
type XMLEncoder struct {
	RootElement string
	ItemElement string
}

// Encode converts records into XML bytes.
func (encoder XMLEncoder) Encode(_ context.Context, records []Record) ([]byte, error) {
	buffer := &bytes.Buffer{}
	buffer.WriteString(xml.Header)
	buffer.WriteString("<" + encoder.RootElement + ">")
	for _, record := range records {
		buffer.WriteString("<" + encoder.ItemElement + ">")
		writeXMLFields(buffer, record)
		buffer.WriteString("</" + encoder.ItemElement + ">")
	}
	buffer.WriteString("</" + encoder.RootElement + ">")
	return buffer.Bytes(), nil
}

// nodeToRecord recursively converts an XML node tree into a canonical record.
func nodeToRecord(node xmlNode) Record {
	record := Record{}
	for _, attr := range node.Attrs {
		record["@"+attr.Name.Local] = attr.Value
	}
	if len(node.Children) == 0 {
		record[node.XMLName.Local] = strings.TrimSpace(node.Text)
		return record
	}

	childMap := Record{}
	for _, child := range node.Children {
		childRecord := nodeToRecord(child)
		for key, value := range childRecord {
			childMap[key] = value
		}
	}
	record[node.XMLName.Local] = childMap
	return record
}

// writeXMLFields recursively emits nested records as XML elements.
func writeXMLFields(buffer *bytes.Buffer, value any) {
	switch typed := value.(type) {
	case Record:
		for key, nested := range typed {
			buffer.WriteString("<" + key + ">")
			writeXMLFields(buffer, nested)
			buffer.WriteString("</" + key + ">")
		}
	case map[string]any:
		for key, nested := range typed {
			buffer.WriteString("<" + key + ">")
			writeXMLFields(buffer, nested)
			buffer.WriteString("</" + key + ">")
		}
	default:
		buffer.WriteString(xmlEscape(fmt.Sprint(typed)))
	}
}

// xmlEscape escapes user-provided text without pulling in a heavier writer abstraction.
func xmlEscape(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(value)
}
