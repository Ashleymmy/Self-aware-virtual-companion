(async () => {
  const WS_URL = (() => {
    const params = new URLSearchParams(window.location.search);
    const override = (params.get('savcBase') || '').trim();
    if (override) {
      try {
        const parsed = new URL(override, window.location.origin);
        const scheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${scheme}//${parsed.host}/__savc/terminal`;
      } catch {
        // fallback to current origin when override is invalid
      }
    }
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${window.location.host}/__savc/terminal`;
  })();
  const mount  = document.getElementById('xterm-mount');
  const mock   = document.getElementById('vsc-term-mock');
  if (!mount) return;
  try {
    const { Terminal } = await import('https://esm.sh/xterm@5');
    const { FitAddon } = await import('https://esm.sh/xterm-addon-fit@0.8');

    const term = new Terminal({
      fontFamily: '"JetBrains Mono","Fira Code","Courier New",monospace',
      fontSize: 12, lineHeight: 1.35,
      cursorBlink: true, cursorStyle: 'bar',
      allowProposedApi: true,
      theme: {
        background: '#140F0A', foreground: '#D4C4A8',
        cursor: '#C8571E', cursorAccent: '#140F0A',
        selectionBackground: 'rgba(200,87,30,0.3)',
        black: '#1A1510', red: '#C8571E', green: '#73C991',
        yellow: '#E8C080', blue: '#7B9EC4', magenta: '#B8758A',
        cyan: '#6ABFB8', white: '#D4C4A8',
        brightBlack: '#4A3520', brightRed: '#E8824A', brightGreen: '#8ED9A0',
        brightYellow: '#F0D090', brightBlue: '#9AB8D8',
        brightMagenta: '#D0909E', brightCyan: '#8AD4CE', brightWhite: '#F0E8DE',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    let ws = null;
    let connecting = false;
    let xtermActive = false;
    let termInputBound = false;

    function attachInputBridge() {
      if (termInputBound) return;
      termInputBound = true;
      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
      });
    }

    function printReconnectHint(reason) {
      term.writeln(`\r\n\x1b[31m[${reason}]\x1b[0m`);
      term.writeln('\x1b[33m[点击终端区域重连]\x1b[0m');
    }

    function connectPTY() {
      if (connecting) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      connecting = true;
      ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        connecting = false;
        if (!xtermActive) {
          // First connection — mount xterm and hide mock
          term.open(mount);
          if (mock) mock.style.display = 'none';
          mount.style.display = '';
          xtermActive = true;
          window.vscXterm = term;
        }
        attachInputBridge();
        fitAddon.fit();
        term.writeln('\x1b[33m[SAVC Terminal · 已连接]\x1b[0m');
        term.focus();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send('printf "\\n[workspace] "; pwd; printf "\\n[branch] "; git rev-parse --abbrev-ref HEAD 2>/dev/null || true; printf "\\n\\n"\r');
        }
      };
      ws.onmessage = e => {
        if (typeof e.data === 'string') {
          term.write(e.data);
          return;
        }
        term.write(new Uint8Array(e.data));
      };
      ws.onclose = () => {
        connecting = false;
        ws = null;
        printReconnectHint('连接已断开');
      };
      ws.onerror = () => {
        connecting = false;
        printReconnectHint('PTY 连接失败');
      };
    }

    mount.addEventListener('click', () => {
      if (!xtermActive) return;
      term.focus();
      if (!ws || ws.readyState >= WebSocket.CLOSING) connectPTY();
    });

    // Attempt connection when widget expands
    const origExpand = window.expandVSCode;
    window.expandVSCode = function() {
      if (origExpand) origExpand();
      if (!xtermActive || !ws || ws.readyState >= WebSocket.CLOSING) {
        setTimeout(() => { try { connectPTY(); } catch { /* offline */ } }, 160);
      } else {
        setTimeout(() => {
          fitAddon.fit();
          term.focus();
        }, 50);
      }
    };

    // Resize on window change
    window.addEventListener('resize', () => { if (xtermActive) fitAddon.fit(); });

    console.log('[SAVC] xterm.js loaded');
  } catch (e) {
    console.warn('[SAVC] xterm.js unavailable:', e.message);
  }
})();
