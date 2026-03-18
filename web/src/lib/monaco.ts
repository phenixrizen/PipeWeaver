import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

let configured = false;

export const ensureMonacoEnvironment = () => {
  if (configured || typeof window === "undefined") {
    return;
  }

  window.MonacoEnvironment = {
    getWorker(_: string, label: string) {
      if (label === "json") {
        return new jsonWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker();
      }
      return new editorWorker();
    },
  };

  configured = true;
};
