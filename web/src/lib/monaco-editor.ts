import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";

type TabularLanguageId = "csv" | "tsv" | "pipe";

const tabularDefinitions: Record<
  TabularLanguageId,
  { delimiter: RegExp; field: RegExp }
> = {
  csv: {
    delimiter: /,/,
    field: /[^",\r\n]+/,
  },
  tsv: {
    delimiter: /\t/,
    field: /[^"\t\r\n]+/,
  },
  pipe: {
    delimiter: /\|/,
    field: /[^"|\r\n]+/,
  },
};

const registerTabularLanguage = (id: TabularLanguageId) => {
  const existingLanguage = monaco.languages
    .getLanguages()
    .find((language) => language.id === id);
  if (existingLanguage) {
    return;
  }

  const definition = tabularDefinitions[id];

  monaco.languages.register({ id });
  monaco.languages.setLanguageConfiguration(id, {
    comments: {
      lineComment: "#",
    },
    autoClosingPairs: [{ open: '"', close: '"' }],
    surroundingPairs: [{ open: '"', close: '"' }],
  });
  monaco.languages.setMonarchTokensProvider(id, {
    tokenizer: {
      root: [
        [/^#.*$/, "comment"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@quotedField" }],
        [definition.delimiter, "delimiter"],
        [/-?\d+(?:\.\d+)?/, "number"],
        [definition.field, "identifier"],
      ],
      quotedField: [
        [/""/, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
        [/[^"]+/, "string"],
      ],
    },
  });
};

registerTabularLanguage("csv");
registerTabularLanguage("tsv");
registerTabularLanguage("pipe");

export default monaco;
