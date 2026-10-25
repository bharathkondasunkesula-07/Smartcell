"""
SmartCell — Arduino USB Serial to WebSocket Bridge
Reads telemetry from Arduino Uno over USB Serial (9600 baud) and
broadcasts validated JSON readings to the SmartCell Web Dashboard.

Dependencies:
    pip install pyserial websockets
Usage:
    python serial_bridge.py [--port COM3] [--baud 9600] [--ws-port 8765]
"""

import sys
import os
import json
import time
import argparse
import asyncio
from datetime import datetime

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[ERROR] 'pyserial' is not installed.")
    print("Please run: pip install pyserial websockets")
    sys.exit(1)

try:
    import websockets
except ImportError:
    print("[ERROR] 'websockets' is not installed.")
    print("Please run: pip install websockets")
    sys.exit(1)

# Default configuration
DEFAULT_BAUD = 9600
DEFAULT_WS_PORT = 8765
DEFAULT_WS_HOST = "localhost"

# Global state
active_serial = None
current_port = None
connected_clients = set()
latest_measurement = None
is_running = True


def list_available_ports():
    """Returns a list of available COM ports with hardware descriptions."""
    ports = serial.tools.list_ports.comports()
    port_list = []
    for p in ports:
        is_arduino = False
        desc_lower = (p.description or "").lower()
        mfg_lower = (p.manufacturer or "").lower()
        if "arduino" in desc_lower or "arduino" in mfg_lower or "ch340" in desc_lower or "ftdi" in desc_lower:
            is_arduino = True

        port_list.append({
            "device": p.device,
            "description": p.description,
            "manufacturer": p.manufacturer or "Unknown",
            "hwid": p.hwid,
            "is_arduino": is_arduino
        })
    return port_list


def detect_arduino_port():
    """Auto-detects the first Arduino or serial adapter port."""
    ports = list_available_ports()
    for p in ports:
        if p["is_arduino"]:
            return p["device"]
    if len(ports) > 0:
        return ports[0]["device"]
    return None


async def broadcast_message(message_dict):
    """Broadcasts a JSON message to all connected WebSocket clients."""
    if not connected_clients:
        return
    msg_str = json.dumps(message_dict)
    disconnected = set()
    for ws in list(connected_clients):
        try:
            await ws.send(msg_str)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        connected_clients.discard(ws)


def validate_arduino_reading(raw_dict):
    """
    Validates incoming Arduino JSON telemetry according to SmartCell protocol:
    - Must have 'type': 'measurement' (or 'status' / 'error')
    - Required numeric readings must be finite numbers
    - Distinguishes bus voltage, current (mA and converted A), temperature, load state
    """
    if not isinstance(raw_dict, dict):
        return None

    msg_type = raw_dict.get("type", "measurement")

    if msg_type in ("status", "error"):
        return raw_dict

    # Validate measurement
    voltage_v = raw_dict.get("voltage_V")
    current_ma = raw_dict.get("current_mA")
    temp_c = raw_dict.get("temperature_C")
    power_mw = raw_dict.get("power_mW")
    load_state = raw_dict.get("load_state", "OFF")

    # Voltage is strictly required
    if voltage_v is None or not isinstance(voltage_v, (int, float)):
        return None

    # Current is required
    if current_ma is None or not isinstance(current_ma, (int, float)):
        current_ma = 0.0

    # Convert current correctly: A = mA / 1000.0
    current_a = round(float(current_ma) / 1000.0, 4)

    # Compute power if not provided
    if power_mw is None or not isinstance(power_mw, (int, float)):
        power_mw = round(float(voltage_v) * abs(float(current_ma)), 2)

    # Temperature validation (DS18B20 returns -127.0 on error/disconnected)
    temp_valid = True
    if temp_c is not None:
        if not isinstance(temp_c, (int, float)) or temp_c <= -100 or temp_c >= 125:
            temp_c = None
            temp_valid = False

    return {
        "type": "measurement",
        "voltage_V": round(float(voltage_v), 3),
        "current_mA": round(float(current_ma), 2),
        "current_A": current_a,
        "power_mW": round(float(power_mw), 2),
        "temperature_C": round(float(temp_c), 1) if temp_c is not None else None,
        "temperature_valid": temp_valid,
        "load_state": "ON" if str(load_state).upper() == "ON" else "OFF",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def open_serial_connection(port, baud):
    """Attempts to open the specified COM port cleanly."""
    global active_serial, current_port
    try:
        if active_serial and active_serial.is_open:
            active_serial.close()
        
        print(f"[SERIAL] Opening {port} at {baud} baud...")
        ser = serial.Serial(
            port=port,
            baudrate=baud,
            timeout=1.0,
            write_timeout=1.0
        )
        time.sleep(1.8) # Wait for Arduino bootloader reset
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        active_serial = ser
        current_port = port
        print(f"[SERIAL] Connected successfully to {port}")
        return True, None
    except Exception as e:
        active_serial = None
        current_port = None
        err_msg = str(e)
        print(f"[SERIAL ERROR] Failed to open {port}: {err_msg}")
        return False, err_msg


def close_serial_connection():
    """Closes active serial connection safely."""
    global active_serial, current_port
    if active_serial:
        try:
            if active_serial.is_open:
                # Ensure load is switched off before disconnecting
                try:
                    active_serial.write(b"LOAD:OFF\n")
                    time.sleep(0.05)
                except Exception:
                    pass
                active_serial.close()
        except Exception:
            pass
    active_serial = None
    current_port = None
    print("[SERIAL] Port closed.")


async def serial_reader_task(loop):
    """Asynchronous background loop that reads lines from serial port."""
    global active_serial, latest_measurement, is_running
    
    while is_running:
        if active_serial and active_serial.is_open:
            try:
                line = await loop.run_in_executor(None, active_serial.readline)
                if line:
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if decoded.startswith("{") and decoded.endswith("}"):
                        try:
                            parsed = json.loads(decoded)
                            validated = validate_arduino_reading(parsed)
                            if validated:
                                latest_measurement = validated
                                await broadcast_message(validated)
                        except json.JSONDecodeError:
                            # Non-JSON or malformed line
                            pass
                    elif decoded.startswith("#") or decoded.startswith("ERROR:"):
                        # Forward Arduino debug/status log
                        await broadcast_message({
                            "type": "log",
                            "message": decoded,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        })
            except serial.SerialException as e:
                print(f"[SERIAL DISCONNECTED] Device error: {e}")
                close_serial_connection()
                await broadcast_message({
                    "type": "device_status",
                    "connected": False,
                    "error": f"Device disconnected or communication failed: {str(e)}",
                    "port": current_port,
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                })
            except Exception as e:
                print(f"[SERIAL READ ERROR] {e}")
                await asyncio.sleep(0.1)
        else:
            await asyncio.sleep(0.5)


async def websocket_handler(websocket):
    """Handles incoming client WebSocket connections and commands."""
    global connected_clients, active_serial, current_port, latest_measurement
    connected_clients.add(websocket)
    client_addr = websocket.remote_address
    print(f"[WS] Client connected from {client_addr}")

    # Immediately report current bridge status and available ports to newly connected client
    ports = list_available_ports()
    await websocket.send(json.dumps({
        "type": "bridge_status",
        "bridge_online": True,
        "serial_connected": (active_serial is not None and active_serial.is_open),
        "current_port": current_port,
        "available_ports": ports,
        "latest_measurement": latest_measurement,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }))

    try:
        async for message in websocket:
            try:
                cmd = json.loads(message)
                action = cmd.get("action", "")

                if action == "connect":
                    target_port = cmd.get("port") or detect_arduino_port()
                    baud = int(cmd.get("baud", DEFAULT_BAUD))
                    if not target_port:
                        await websocket.send(json.dumps({
                            "type": "device_status",
                            "connected": False,
                            "error": "No COM port specified or detected.",
                            "available_ports": list_available_ports()
                        }))
                        continue

                    ok, err = open_serial_connection(target_port, baud)
                    if ok:
                        await broadcast_message({
                            "type": "device_status",
                            "connected": True,
                            "port": target_port,
                            "baud": baud,
                            "message": f"Connected to {target_port} at {baud} baud."
                        })
                    else:
                        await websocket.send(json.dumps({
                            "type": "device_status",
                            "connected": False,
                            "port": target_port,
                            "error": f"Failed to connect to {target_port}: {err}",
                            "available_ports": list_available_ports()
                        }))

                elif action == "disconnect":
                    close_serial_connection()
                    await broadcast_message({
                        "type": "device_status",
                        "connected": False,
                        "port": None,
                        "message": "Disconnected by user request."
                    })

                elif action == "list_ports":
                    await websocket.send(json.dumps({
                        "type": "ports_list",
                        "ports": list_available_ports()
                    }))

                elif action == "set_load":
                    # Load control with strict safety verification
                    target_state = cmd.get("state", "OFF").upper()
                    if active_serial and active_serial.is_open:
                        if target_state == "ON":
                            active_serial.write(b"LOAD:ON\n")
                            print("[LOAD] Sent command: LOAD:ON")
                        else:
                            active_serial.write(b"LOAD:OFF\n")
                            print("[LOAD] Sent command: LOAD:OFF")
                    else:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "message": "Cannot control load: Arduino is not connected."
                        }))

            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[WS] Client disconnected ({client_addr})")


async def main():
    parser = argparse.ArgumentParser(description="SmartCell Arduino Serial to WebSocket Bridge")
    parser.add_argument("--port", type=str, default=None, help="COM port (e.g. COM3). Auto-detected if omitted.")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Serial baud rate (default: 9600)")
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT, help="WebSocket server port (default: 8765)")
    parser.add_argument("--ws-host", type=str, default=DEFAULT_WS_HOST, help="WebSocket host (default: localhost)")
    parser.add_argument("--auto-connect", action="store_true", help="Automatically connect to first detected Arduino")
    args = parser.parse_args()

    print("=" * 60)
    print("  SmartCell — Arduino USB Serial WebSocket Bridge")
    print("=" * 60)
    print(f"  WebSocket URL : ws://{args.ws_host}:{args.ws_port}")
    print(f"  Default Baud  : {args.baud}")
    
    ports = list_available_ports()
    print("  Available COM Ports:")
    if ports:
        for p in ports:
            mark = " [Arduino/CH340]" if p["is_arduino"] else ""
            print(f"   - {p['device']}: {p['description']}{mark}")
    else:
        print("   (No COM ports detected. Plug in Arduino USB cable)")
    print("=" * 60)

    # Optional initial connection if requested
    if args.port or args.auto_connect:
        target = args.port or detect_arduino_port()
        if target:
            open_serial_connection(target, args.baud)

    loop = asyncio.get_running_loop()
    loop.create_task(serial_reader_task(loop))

    async with websockets.serve(websocket_handler, args.ws_host, args.ws_port):
        print(f"[READY] WebSocket bridge listening on ws://{args.ws_host}:{args.ws_port}")
        print("Press Ctrl+C to stop the bridge.\n")
        await asyncio.Future() # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOPPING] Shutting down bridge...")
        close_serial_connection()
        sys.exit(0)
