# ghidraMCP-vscode

GhidraMCP-vscode is a VS Code extension that provides integration with [GhidraMCP](https://github.com/LaurieWired/GhidraMCP).

**NOTICE**: This extension is unofficial and not affiliated with the Ghidra project or its maintainers.

## Features

- **Start/Stop Ghidra MCP Server**: Control the Ghidra MCP bridge server from VS Code command palette
- **Automatic Virtual Environment Management**: Creates and manages a Python virtual environment for the bridge server
- **Configurable Settings**: Customize bridge script path, virtual environment location, and server parameters
- **Integrated Logging**: View server logs in VS Code Output panel

## Requirements

- Python 3.12 or later
- `bridge_mcp_ghidra.py` script with PEP 723 dependencies specification
- Ghidra server running (default: http://127.0.0.1:8080/)
- **Recommended**: [uv](https://docs.astral.sh/uv/) for optimal PEP 723 dependency management

## Extension Settings

This extension contributes the following settings:

* `ghidramcp.bridgeScriptPath`: Path to the bridge_mcp_ghidra.py script (required)
* `ghidramcp.venvPath`: Path to Python virtual environment (optional - if empty, will create in extension cache)
* `ghidramcp.mcpHost`: MCP server host (default: 127.0.0.1)
* `ghidramcp.mcpPort`: MCP server port (default: 8081)  
* `ghidramcp.ghidraServer`: Ghidra server URL (default: http://127.0.0.1:8080/)

## Usage

1. **Configure the extension**:
   - Open VS Code settings (Cmd+, on Mac, Ctrl+, on Windows/Linux)
   - Search for "ghidramcp"
   - Set the path to your `bridge_mcp_ghidra.py` script
   - Optionally configure other settings

2. **Start the server**:
   - Open the command palette (Cmd+Shift+P on Mac, Ctrl+Shift+P on Windows/Linux)
   - Run "Start Ghidra MCP Server"
   - Check the "Ghidra MCP" output panel for logs

3. **Stop the server**:
   - Open the command palette
   - Run "Stop Ghidra MCP Server"

## Setup Process

When you start the server for the first time:

1. **With uv (recommended)**: The extension will use `uv run` to automatically handle PEP 723 dependencies from the script
2. **Without uv**: The extension will create a Python virtual environment, parse PEP 723 dependencies from the script, and install them using pip
3. It will start the bridge server with the configured parameters

## Troubleshooting

- **Server won't start**: Check that the bridge script path is correct and the file exists
- **Python errors**: Ensure Python 3.12+ is installed and accessible via `python3` command
- **Connection issues**: Verify that Ghidra server is running and accessible at the configured URL
- **Logs**: Always check the "Ghidra MCP" output panel for detailed error information

## Commands

- `Start Ghidra MCP Server`: Starts the bridge server process
- `Stop Ghidra MCP Server`: Stops the running bridge server process
