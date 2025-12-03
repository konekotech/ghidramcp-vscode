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
	// `bridgeScriptPath` can be a string or an object containing per-OS paths
	const bridgeScriptPathConfig = config.get<any>('bridgeScriptPath');
	let bridgeScriptPath: string | undefined;
	if (typeof bridgeScriptPathConfig === 'string') {
		bridgeScriptPath = bridgeScriptPathConfig;
	} else if (bridgeScriptPathConfig && typeof bridgeScriptPathConfig === 'object') {
		const platform = process.platform; // 'win32' | 'darwin' | 'linux'
		// Prefer exact platform key, then 'default', then fallback to any available entry
		bridgeScriptPath = bridgeScriptPathConfig[platform] || bridgeScriptPathConfig['default'];
		if (!bridgeScriptPath) {
			// pick first defined entry (win32/darwin/linux)
			bridgeScriptPath = bridgeScriptPathConfig['win32'] || bridgeScriptPathConfig['darwin'] || bridgeScriptPathConfig['linux'];
		}
	}
	const venvPath = config.get<string>('venvPath');
	const mcpHost = config.get<string>('mcpHost', '127.0.0.1');
	const mcpPort = config.get<number>('mcpPort', 8081);
	const ghidraServer = config.get<string>('ghidraServer', 'http://127.0.0.1:8080/');

	if (!bridgeScriptPath) {
		vscode.window.showErrorMessage('Please configure the bridge script path in settings (supports OS-specific object or a single string)');
		return;
	}

	if (!fs.existsSync(bridgeScriptPath)) {
		vscode.window.showErrorMessage(`Bridge script not found for this platform: ${bridgeScriptPath}`);
		return;
	}

	try {
		// Setup virtual environment
		const pythonCommand = await setupVirtualEnvironment(context, bridgeScriptPath, venvPath);
		
		// Start the server
		let command: string;
		let args: string[];
		
		if (pythonCommand === 'uv') {
			// Use uv run for PEP 723 dependency management
			command = 'uv';
			args = [
				'run',
				bridgeScriptPath,
				'--transport', 'sse',
				'--mcp-host', mcpHost,
				'--mcp-port', mcpPort.toString(),
				'--ghidra-server', ghidraServer
			];
		} else {
			// Use traditional python execution
			command = pythonCommand;
			args = [
				bridgeScriptPath,
				'--transport', 'sse',
				'--mcp-host', mcpHost,
				'--mcp-port', mcpPort.toString(),
				'--ghidra-server', ghidraServer
			];
		}

		outputChannel.appendLine(`Starting Ghidra MCP server with command: ${command} ${args.join(' ')}`);
		outputChannel.show();

		serverProcess = spawn(command, args);

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

async function checkUvAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const uvCheck = spawn('uv', ['--version']);
		
		uvCheck.on('close', (code) => {
			resolve(code === 0);
		});

		uvCheck.on('error', () => {
			resolve(false);
		});
	});
}

async function installPep723Dependencies(bridgeScriptPath: string, venvPath: string): Promise<void> {
	try {
		// Parse PEP 723 dependencies from the script
		const dependencies = await parsePep723Dependencies(bridgeScriptPath);
		
		if (dependencies.length === 0) {
			outputChannel.appendLine('No PEP 723 dependencies found in script');
			return;
		}

		outputChannel.appendLine(`Installing PEP 723 dependencies: ${dependencies.join(', ')}`);
		
		const pipPath = process.platform === 'win32' 
			? path.join(venvPath, 'Scripts', 'pip.exe')
			: path.join(venvPath, 'bin', 'pip');

		await new Promise<void>((resolve) => {
			const installDeps = spawn(pipPath, ['install', ...dependencies]);
			
			installDeps.stdout?.on('data', (data) => {
				outputChannel.appendLine(`[PIP STDOUT] ${data.toString()}`);
			});

			installDeps.stderr?.on('data', (data) => {
				outputChannel.appendLine(`[PIP STDERR] ${data.toString()}`);
			});

			installDeps.on('close', (code) => {
				if (code === 0) {
					outputChannel.appendLine('PEP 723 dependencies installed successfully');
				} else {
					outputChannel.appendLine(`pip install failed with exit code: ${code}`);
				}
				resolve();
			});

			installDeps.on('error', (error) => {
				outputChannel.appendLine(`pip install error: ${error.message}`);
				resolve();
			});
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error installing PEP 723 dependencies: ${errorMessage}`);
	}
}

async function parsePep723Dependencies(bridgeScriptPath: string): Promise<string[]> {
	try {
		const content = fs.readFileSync(bridgeScriptPath, 'utf-8');
		const lines = content.split('\n');
		
		let inDependenciesBlock = false;
		const dependencies: string[] = [];
		
		for (const line of lines) {
			const trimmedLine = line.trim();
			
			// Check for start of script metadata block
			if (trimmedLine === '# /// script') {
				continue;
			}
			
			// Check for end of script metadata block
			if (trimmedLine === '# ///') {
				break;
			}
			
			// Check for dependencies array start
			if (trimmedLine.startsWith('# dependencies = [')) {
				inDependenciesBlock = true;
				// Handle single-line dependencies array
				const match = trimmedLine.match(/# dependencies = \[(.*)\]/);
				if (match) {
					const deps = match[1].split(',').map(dep => dep.trim().replace(/['"]/g, ''));
					dependencies.push(...deps.filter(dep => dep.length > 0));
					inDependenciesBlock = false;
				}
				continue;
			}
			
			// If we're in the dependencies block, collect dependencies
			if (inDependenciesBlock) {
				if (trimmedLine.startsWith('#') && trimmedLine.includes('"')) {
					// Extract dependency from line like: #     "requests>=2,<3",
					const match = trimmedLine.match(/#\s*"([^"]+)"/);
					if (match) {
						dependencies.push(match[1]);
					}
				} else if (trimmedLine.includes(']')) {
					// End of dependencies array
					inDependenciesBlock = false;
				}
			}
		}
		
		return dependencies;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error parsing PEP 723 dependencies: ${errorMessage}`);
		return [];
	}
}

async function setupVirtualEnvironment(context: vscode.ExtensionContext, bridgeScriptPath: string, configuredVenvPath?: string): Promise<string> {
	// Check if uv is available
	const hasUv = await checkUvAvailable();
	
	if (hasUv) {
		outputChannel.appendLine('Using uv for dependency management (PEP 723 support)');
		// With uv, we can use `uv run` directly which handles PEP 723 dependencies
		// No need to manage virtual environment manually
		return 'uv';
	}

	// Fallback to traditional venv + pip approach
	outputChannel.appendLine('uv not found, falling back to traditional venv + pip');
	
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

	// Install PEP 723 dependencies by parsing the script
	await installPep723Dependencies(bridgeScriptPath, venvPath);

	return pythonPath;
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = null;
	}
}
