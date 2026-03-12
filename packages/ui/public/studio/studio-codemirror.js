(async () => {
  try {
    const { EditorView, minimalSetup } = await import('https://esm.sh/codemirror@6?bundle');
    const { javascript }   = await import('https://esm.sh/@codemirror/lang-javascript@6?bundle');
    const { html: lHtml }  = await import('https://esm.sh/@codemirror/lang-html@6?bundle');
    const { css: lCss }    = await import('https://esm.sh/@codemirror/lang-css@6?bundle');
    const { markdown: lMd } = await import('https://esm.sh/@codemirror/lang-markdown@6?bundle');
    const { json: lJson }  = await import('https://esm.sh/@codemirror/lang-json@6?bundle');
    const { yaml: lYaml }  = await import('https://esm.sh/@codemirror/lang-yaml@6?bundle');
    const { EditorState, Compartment } = await import('https://esm.sh/@codemirror/state@6?bundle');
    const { keymap } = await import('https://esm.sh/@codemirror/view@6?bundle');
    const { defaultKeymap, indentWithTab } = await import('https://esm.sh/@codemirror/commands@6?bundle');

    const warmTheme = EditorView.theme({
      '&': { background: '#1A1510', color: '#D4C4A8', height: '100%' },
      '.cm-content': { fontFamily: '"JetBrains Mono","Fira Code","Courier New",monospace', fontSize: '12px', caretColor: '#C8571E' },
      '.cm-cursor,.cm-dropCursor': { borderLeftColor: '#C8571E !important' },
      '.cm-activeLine': { backgroundColor: 'rgba(200,87,30,0.07)' },
      '&.cm-focused .cm-selectionBackground,.cm-selectionBackground,.cm-content ::selection': { backgroundColor: 'rgba(200,87,30,0.22) !important' },
      '.cm-gutters': { background: '#140F0A', borderRight: '1px solid #3A2E1E', color: '#6B5A40' },
      '.cm-lineNumbers .cm-gutterElement': { color: '#6B5A40', paddingRight: '8px' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(200,87,30,0.1) !important', color: '#C8A880' },
    }, { dark: true });

    const langComp = new Compartment();
    const langMap = {
      typescript: javascript({ typescript: true }), javascript: javascript(),
      html: lHtml(), css: lCss(), markdown: lMd(), json: lJson(), yaml: lYaml(),
    };

    let cmView = null;
    const mount = document.getElementById('vsc-cm-mount');

    window.vscCM = {
      open(content, language) {
        if (cmView) { cmView.destroy(); cmView = null; }
        const lang = langMap[language] || [];
        cmView = new EditorView({
          state: EditorState.create({
            doc: content,
            extensions: [
              minimalSetup, warmTheme,
              langComp.of(Array.isArray(lang) ? lang : [lang]),
              keymap.of([...defaultKeymap, indentWithTab]),
              EditorView.lineWrapping,
            ],
          }),
          parent: mount,
        });
      },
      getContent() { return cmView ? cmView.state.doc.toString() : null; },
      setLang(language) {
        if (!cmView) return;
        const lang = langMap[language] || [];
        cmView.dispatch({ effects: langComp.reconfigure(Array.isArray(lang) ? lang : [lang]) });
      },
    };
    console.log('[SAVC] CodeMirror 6 loaded');
  } catch (e) {
    console.warn('[SAVC] CodeMirror unavailable (offline mode):', e.message);
  }
})();
