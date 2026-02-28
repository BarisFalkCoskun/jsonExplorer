import { basename } from "path";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import loader from "@monaco-editor/loader";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import StyledMonacoEditor from "components/apps/MonacoEditor/StyledMonacoEditor";
import { type ComponentProcessProps } from "components/system/Apps/RenderComponent";
import useTitle from "components/system/Window/useTitle";
import { useFileSystem } from "contexts/fileSystem";
import { useProcesses } from "contexts/process";

const MonacoEditor: FC<ComponentProcessProps> = ({ id }) => {
  const {
    processes: { [id]: process } = {},
  } = useProcesses();
  const { closing = false, url = "" } = process || {};
  const { readFile, writeFile } = useFileSystem();
  const { prependFileToTitle } = useTitle(id);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const loadedUrlRef = useRef("");

  const saveFile = useCallback(async (): Promise<void> => {
    if (!editorRef.current || !url) return;
    const content = editorRef.current.getValue();

    await writeFile(url, Buffer.from(content), true);
    setUnsaved(false);
    prependFileToTitle(basename(url), false);
  }, [prependFileToTitle, url, writeFile]);

  useEffect(() => {
    if (!url || !containerRef.current || closing || loadedUrlRef.current === url)
      return;

    let disposed = false;

    const initEditor = async (): Promise<void> => {
      const fileContent = await readFile(url);
      if (disposed) return;

      const monaco = await loader.init();
      if (disposed) return;

      if (editorRef.current) {
        editorRef.current.setValue(fileContent.toString());
      } else {
        const editor = monaco.editor.create(containerRef.current!, {
          value: fileContent.toString(),
          language: "json",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
        });

        editor.onDidChangeModelContent(() => {
          setUnsaved(true);
        });

        editorRef.current = editor;
      }

      loadedUrlRef.current = url;
      prependFileToTitle(basename(url));
    };

    initEditor();

    return () => {
      disposed = true;
    };
  }, [closing, prependFileToTitle, readFile, url]);

  useEffect(() => {
    if (unsaved) {
      prependFileToTitle(basename(url), true);
    }
  }, [prependFileToTitle, unsaved, url]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        saveFile();
      }
    };

    const container = containerRef.current;

    container?.addEventListener("keydown", handleKeyDown);

    return () => container?.removeEventListener("keydown", handleKeyDown);
  }, [saveFile]);

  useEffect(
    () => () => {
      editorRef.current?.dispose();
    },
    []
  );

  return <StyledMonacoEditor ref={containerRef} />;
};

export default memo(MonacoEditor);
