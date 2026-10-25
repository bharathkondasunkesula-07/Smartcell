/**
 * SmartCell — Unified Hardware Connection Manager
 * Supports two reliable connection modes:
 *  1. Local Python Serial Bridge via WebSocket (ws://localhost:8765)
 *  2. Direct Browser Web Serial API (Chrome / Edge desktop USB)
 *
 * Emits unified telemetry records, tracks connection states, and handles clean disconnections.
 */

export class ConnectionManager {
  constructor(options = {}) {
    this.mode = options.mode || 'bridge'; // 'bridge' or 'webserial'
    this.wsUrl = options.wsUrl || 'ws://localhost:8765';
    this.baudRate = options.baudRate || 9600;

    // Callbacks
    this.onTelemetry = options.onTelemetry || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});
    this.onPortsListed = options.onPortsListed || (() => {});

    // State
    this.isConnected = false;
    this.isReconnecting = false;
    this.activePortName = null;

    // WebSocket Bridge State
    this.ws = null;
    this.reconnectTimer = null;
    this.shouldAutoReconnect = false;

    // Web Serial API State
    this.webSerialPort = null;
    this.webSerialReader = null;
    this.webSerialStreamClosed = null;
    this.serialBuffer = '';
  }

  setMode(newMode) {
    if (this.isConnected) {
      this.disconnect();
    }
    this.mode = newMode;
  }

  setWsUrl(url) {
    this.wsUrl = url;
  }

  setBaudRate(baud) {
    this.baudRate = Number(baud) || 9600;
  }

  // --- Unified Connect Method ---
  async connect(preferredPort = null) {
    if (this.mode === 'bridge') {
      return this.connectBridge(preferredPort);
    } else {
      return this.connectWebSerial();
    }
  }

  // --- Unified Disconnect Method ---
  async disconnect() {
    this.shouldAutoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.mode === 'bridge') {
      this.disconnectBridge();
    } else {
      await this.disconnectWebSerial();
    }

    this.isConnected = false;
    this.isReconnecting = false;
    this.activePortName = null;
    this.onStatusChange('disconnected', { message: 'Disconnected by user' });
  }

  // ==========================================
  // Mode 1: Python WebSocket Bridge
  // ==========================================
  connectBridge(preferredPort = null) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldAutoReconnect = true;
    this.onStatusChange('connecting', { message: `Connecting to Serial Bridge at ${this.wsUrl}...` });

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[BRIDGE] WebSocket connection established.');
        this.isReconnecting = false;
        // Ask bridge to connect to Arduino
        this.ws.send(jsonStringifySafe({
          action: 'connect',
          port: preferredPort,
          baud: this.baudRate
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleBridgeMessage(data);
        } catch (e) {
          console.warn('[BRIDGE] Malformed message received:', event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[BRIDGE] WebSocket error:', err);
        this.onError('Unable to reach Python Serial Bridge at ' + this.wsUrl + '. Ensure bridge is running.');
      };

      this.ws.onclose = () => {
        console.log('[BRIDGE] WebSocket connection closed.');
        const wasConnected = this.isConnected;
        this.isConnected = false;

        if (this.shouldAutoReconnect) {
          this.isReconnecting = true;
          this.onStatusChange('reconnecting', { message: 'Bridge disconnected. Retrying in 3s...' });
          this.reconnectTimer = setTimeout(() => {
            if (this.shouldAutoReconnect) {
              this.connectBridge(preferredPort);
            }
          }, 3000);
        } else {
          this.onStatusChange('disconnected', { message: 'Bridge disconnected.' });
        }
      };
    } catch (e) {
      this.onError('WebSocket connection failed: ' + e.message);
      this.onStatusChange('disconnected', { message: e.message });
    }
  }

  handleBridgeMessage(data) {
    if (!data || typeof data !== 'object') return;

    const type = data.type;

    if (type === 'measurement') {
      this.isConnected = true;
      this.onTelemetry(data);
    } else if (type === 'device_status') {
      if (data.connected) {
        this.isConnected = true;
        this.activePortName = data.port || 'Arduino Uno';
        this.onStatusChange('connected', {
          port: this.activePortName,
          baud: data.baud || this.baudRate,
          message: data.message || `Connected to ${this.activePortName}`
        });
      } else {
        this.isConnected = false;
        this.onStatusChange('disconnected', {
          message: data.error || data.message || 'Arduino device disconnected.'
        });
        if (data.error) {
          this.onError(data.error);
        }
      }
    } else if (type === 'bridge_status') {
      if (data.serial_connected) {
        this.isConnected = true;
        this.activePortName = data.current_port;
        this.onStatusChange('connected', {
          port: data.current_port,
          message: `Bridge active on ${data.current_port}`
        });
      }
      if (data.available_ports) {
        this.onPortsListed(data.available_ports);
      }
    } else if (type === 'ports_list') {
      this.onPortsListed(data.ports || []);
    } else if (type === 'error') {
      this.onError(data.message || 'Bridge error reported.');
    }
  }

  disconnectBridge() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'disconnect' }));
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  requestPortList() {
    if (this.mode === 'bridge' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'list_ports' }));
    }
  }

  sendLoadControl(state) {
    const cmd = state ? 'ON' : 'OFF';
    if (this.mode === 'bridge') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'set_load', state: cmd }));
      }
    } else if (this.mode === 'webserial') {
      this.writeWebSerial(`LOAD:${cmd}\n`);
    }
  }

  // ==========================================
  // Mode 2: Direct Browser Web Serial API
  // ==========================================
  isWebSerialSupported() {
    return 'serial' in navigator;
  }

  async connectWebSerial() {
    if (!this.isWebSerialSupported()) {
      this.onError('Web Serial API is not supported in this browser. Please use Chrome/Edge or the Python Bridge.');
      return false;
    }

    try {
      this.onStatusChange('connecting', { message: 'Requesting USB Serial Port...' });
      
      // Request serial port prompt from user
      this.webSerialPort = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x2341 }, // Official Arduino
          { usbVendorId: 0x1a86 }, // CH340 clones
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x10c4 }  // CP210x
        ]
      });

      await this.webSerialPort.open({ baudRate: this.baudRate });
      this.isConnected = true;
      const portInfo = this.webSerialPort.getInfo();
      this.activePortName = portInfo.usbVendorId ? `USB Device (VID: 0x${portInfo.usbVendorId.toString(16)})` : 'Arduino Serial';

      this.onStatusChange('connected', {
        port: this.activePortName,
        baud: this.baudRate,
        message: `Connected via Web Serial at ${this.baudRate} baud.`
      });

      // Start reading stream
      this.startWebSerialReader();
      return true;
    } catch (err) {
      console.warn('[WEB SERIAL] Connection error:', err);
      this.isConnected = false;
      this.onStatusChange('disconnected', { message: err.message || 'Cancelled port selection' });
      if (err.name !== 'NotFoundError') { // Don't show alert if user simply cancelled the picker
        this.onError(`Failed to open serial port: ${err.message}`);
      }
      return false;
    }
  }

  async startWebSerialReader() {
    const textDecoder = new TextDecoderStream();
    this.webSerialStreamClosed = this.webSerialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.webSerialReader = reader;
    this.serialBuffer = '';

    try {
      while (this.isConnected) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.serialBuffer += value;
          const lines = this.serialBuffer.split(/\r?\n/);
          this.serialBuffer = lines.pop(); // Keep incomplete tail

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === 'measurement') {
                  // Ensure proper formatting
                  parsed.current_A = parsed.current_mA != null ? Number((parsed.current_mA / 1000.0).toFixed(4)) : 0;
                  parsed.timestamp = new Date().toISOString();
                  this.onTelemetry(parsed);
                } else if (parsed.type === 'error') {
                  this.onError(`${parsed.sensor || 'Hardware'}: ${parsed.message}`);
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      console.warn('[WEB SERIAL] Read loop error:', e);
      if (this.isConnected) {
        this.onError('Serial communication lost: ' + e.message);
        this.disconnect();
      }
    } finally {
      reader.releaseLock();
    }
  }

  async writeWebSerial(text) {
    if (!this.webSerialPort || !this.webSerialPort.writable) return;
    try {
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.webSerialPort.writable);
      const writer = textEncoder.writable.getWriter();
      await writer.write(text);
      await writer.close();
      await writableStreamClosed;
    } catch (e) {
      console.warn('[WEB SERIAL] Write error:', e);
    }
  }

  async disconnectWebSerial() {
    if (this.webSerialReader) {
      try {
        await this.webSerialReader.cancel();
      } catch (e) {}
      this.webSerialReader = null;
    }

    if (this.webSerialStreamClosed) {
      try {
        await this.webSerialStreamClosed.catch(() => {});
      } catch (e) {}
      this.webSerialStreamClosed = null;
    }

    if (this.webSerialPort) {
      try {
        await this.webSerialPort.close();
      } catch (e) {}
      this.webSerialPort = null;
    }
  }
}

function jsonStringifySafe(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '{}';
  }
}
