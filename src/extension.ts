// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

let outputChannel: vscode.OutputChannel;
let serverProcess: ChildProcess | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Create output channel for logging
	outputChannel = vscode.window.createOutputChannel('Ghidra MCP');
	context.subscriptions.push(outputChannel);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "ghidramcp" is now active!');
	outputChannel.appendLine('Ghidra MCP extension activated');

	// Register start server command
	const startServerDisposable = vscode.commands.registerCommand('ghidramcp.startServer', async () => {
		await startServer(context);
	});

	// Register stop server command
	const stopServerDisposable = vscode.commands.registerCommand('ghidramcp.stopServer', async () => {
		await stopServer();
	});

	context.subscriptions.push(startServerDisposable);
	context.subscriptions.push(stopServerDisposable);
}

async function startServer(context: vscode.ExtensionContext) {
	if (serverProcess) {
		vscode.window.showWarningMessage('Ghidra MCP server is already running');
		return;
	}

	const config = vscode.workspace.getConfiguration('ghidramcp');
	const bridgeScriptPath = config.get<string>('bridgeScriptPath');
	const venvPath = config.get<string>('venvPath');
	const mcpHost = config.get<string>('mcpHost', '127.0.0.1');
	const mcpPort = config.get<number>('mcpPort', 8081);
	const ghidraServer = config.get<string>('ghidraServer', 'http://127.0.0.1:8080/');

	if (!bridgeScriptPath) {
		vscode.window.showErrorMessage('Please configure the bridge script path in settings');
		return;
	}

	if (!fs.existsSync(bridgeScriptPath)) {
		vscode.window.showErrorMessage(`Bridge script not found: ${bridgeScriptPath}`);
		return;
	}

	try {
		// Setup virtual environment
		const pythonPath = await setupVirtualEnvironment(context, bridgeScriptPath, venvPath);
		
		// Start the server
		const args = [
			bridgeScriptPath,
			'--transport', 'sse',
			'--mcp-host', mcpHost,
			'--mcp-port', mcpPort.toString(),
			'--ghidra-server', ghidraServer
		];

		outputChannel.appendLine(`Starting Ghidra MCP server with command: ${pythonPath} ${args.join(' ')}`);
		outputChannel.show();

		serverProcess = spawn(pythonPath, args);

		serverProcess.stdout?.on('data', (data) => {
			outputChannel.appendLine(`[STDOUT] ${data.toString()}`);
		});

		serverProcess.stderr?.on('data', (data) => {
			outputChannel.appendLine(`[STDERR] ${data.toString()}`);
		});

		serverProcess.on('close', (code) => {
			outputChannel.appendLine(`Server process exited with code ${code}`);
			serverProcess = null;
		});

		serverProcess.on('error', (error) => {
			outputChannel.appendLine(`Server process error: ${error.message}`);
			serverProcess = null;
			vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
		});

		vscode.window.showInformationMessage('Ghidra MCP server started');

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error starting server: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to start server: ${errorMessage}`);
	}
}

async function stopServer() {
	if (!serverProcess) {
		vscode.window.showWarningMessage('Ghidra MCP server is not running');
		return;
	}

	outputChannel.appendLine('Stopping Ghidra MCP server...');
	serverProcess.kill();
	serverProcess = null;
	vscode.window.showInformationMessage('Ghidra MCP server stopped');
}

async function setupVirtualEnvironment(context: vscode.ExtensionContext, bridgeScriptPath: string, configuredVenvPath?: string): Promise<string> {
	const config = vscode.workspace.getConfiguration('ghidramcp');
	let venvPath: string;

	if (configuredVenvPath && configuredVenvPath.trim() !== '') {
		venvPath = configuredVenvPath;
	} else {
		// Use extension cache directory
		venvPath = path.join(context.globalStorageUri.fsPath, 'venv');
	}

	// Ensure the parent directory exists
	const parentDir = path.dirname(venvPath);
	if (!fs.existsSync(parentDir)) {
		fs.mkdirSync(parentDir, { recursive: true });
	}

	const pythonPath = process.platform === 'win32' 
		? path.join(venvPath, 'Scripts', 'python.exe')
		: path.join(venvPath, 'bin', 'python3');

	// Create virtual environment if it doesn't exist
	if (!fs.existsSync(venvPath)) {
		outputChannel.appendLine(`Creating virtual environment at: ${venvPath}`);
		await new Promise<void>((resolve, reject) => {
			const createVenv = spawn('python3', ['-m', 'venv', venvPath]);
			
			createVenv.stdout?.on('data', (data) => {
				outputChannel.appendLine(`[VENV CREATE STDOUT] ${data.toString()}`);
			});

			createVenv.stderr?.on('data', (data) => {
				outputChannel.appendLine(`[VENV CREATE STDERR] ${data.toString()}`);
			});

			createVenv.on('close', (code) => {
				if (code === 0) {
					outputChannel.appendLine('Virtual environment created successfully');
					resolve();
				} else {
					reject(new Error(`Failed to create virtual environment (exit code: ${code})`));
				}
			});

			createVenv.on('error', (error) => {
				reject(new Error(`Failed to create virtual environment: ${error.message}`));
			});
		});
	}

	// Install requirements if requirements.txt exists
	const bridgeDir = path.dirname(bridgeScriptPath);
	const requirementsPath = path.join(bridgeDir, 'requirements.txt');
	
	if (fs.existsSync(requirementsPath)) {
		outputChannel.appendLine(`Installing requirements from: ${requirementsPath}`);
		await new Promise<void>((resolve, reject) => {
			const pipPath = process.platform === 'win32' 
				? path.join(venvPath, 'Scripts', 'pip.exe')
				: path.join(venvPath, 'bin', 'pip');

			const installReqs = spawn(pipPath, ['install', '-r', requirementsPath]);
			
			installReqs.stdout?.on('data', (data) => {
				outputChannel.appendLine(`[PIP STDOUT] ${data.toString()}`);
			});

			installReqs.stderr?.on('data', (data) => {
				outputChannel.appendLine(`[PIP STDERR] ${data.toString()}`);
			});

			installReqs.on('close', (code) => {
				if (code === 0) {
					outputChannel.appendLine('Requirements installed successfully');
					resolve();
				} else {
					outputChannel.appendLine(`pip install failed with exit code: ${code}`);
					resolve(); // Don't reject, just continue
				}
			});

			installReqs.on('error', (error) => {
				outputChannel.appendLine(`pip install error: ${error.message}`);
				resolve(); // Don't reject, just continue
			});
		});
	}

	return pythonPath;
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = null;
	}
}
