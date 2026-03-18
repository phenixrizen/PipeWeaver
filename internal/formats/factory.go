package formats

import (
	"fmt"
)

// NewDecoder returns a decoder implementation for a named format.
func NewDecoder(name string) (Decoder, error) {
	switch name {
	case "json":
		return JSONDecoder{}, nil
	case "csv":
		return DelimitedDecoder{Delimiter: ','}, nil
	case "tsv":
		return DelimitedDecoder{Delimiter: '\t'}, nil
	case "pipe":
		return DelimitedDecoder{Delimiter: '|'}, nil
	case "xml":
		return XMLDecoder{}, nil
	default:
		return nil, fmt.Errorf("unsupported decoder format %q", name)
	}
}

// NewEncoder returns an encoder implementation for a named format.
func NewEncoder(name string) (Encoder, error) {
	switch name {
	case "json":
		return JSONEncoder{}, nil
	case "csv":
		return DelimitedEncoder{Delimiter: ','}, nil
	case "tsv":
		return DelimitedEncoder{Delimiter: '\t'}, nil
	case "pipe":
		return DelimitedEncoder{Delimiter: '|'}, nil
	case "xml":
		return XMLEncoder{RootElement: "records", ItemElement: "record"}, nil
	default:
		return nil, fmt.Errorf("unsupported encoder format %q", name)
	}
}
