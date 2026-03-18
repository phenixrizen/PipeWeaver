package formats

import (
	"fmt"
	"strings"
)

// NewDecoder constructs a decoder for the named format.
func NewDecoder(format string) (Decoder, error) {
	switch strings.ToLower(format) {
	case "json":
		return JSONDecoder{}, nil
	case "csv":
		return DelimitedDecoder{Delimiter: ','}, nil
	case "tsv":
		return DelimitedDecoder{Delimiter: '\t'}, nil
	case "pipe", "pipe-delimited":
		return DelimitedDecoder{Delimiter: '|'}, nil
	case "xml":
		return XMLDecoder{}, nil
	default:
		return nil, fmt.Errorf("unsupported decoder format %q", format)
	}
}

// NewEncoder constructs an encoder for the named format.
func NewEncoder(format string) (Encoder, error) {
	switch strings.ToLower(format) {
	case "json":
		return JSONEncoder{}, nil
	case "csv":
		return DelimitedEncoder{Delimiter: ','}, nil
	case "tsv":
		return DelimitedEncoder{Delimiter: '\t'}, nil
	case "pipe", "pipe-delimited":
		return DelimitedEncoder{Delimiter: '|'}, nil
	case "xml":
		return XMLEncoder{}, nil
	default:
		return nil, fmt.Errorf("unsupported encoder format %q", format)
	}
}
