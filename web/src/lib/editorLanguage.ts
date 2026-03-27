export const resolveFormatEditorLanguage = (format?: string) => {
  switch (format) {
    case "json":
    case "xml":
    case "csv":
    case "tsv":
    case "pipe":
      return format;
    default:
      return "plaintext";
  }
};

export const editorFileExtensionForLanguage = (language?: string) => {
  switch (language) {
    case "json":
      return "json";
    case "xml":
      return "xml";
    case "csv":
      return "csv";
    case "tsv":
      return "tsv";
    case "pipe":
      return "psv";
    case "markdown":
      return "md";
    case "javascript":
      return "js";
    default:
      return "txt";
  }
};
