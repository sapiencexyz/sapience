#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

interface ClaudeDesktopConfig {
    mcpServers?: {
        [key: string]: {
            command: string;
            args: string[];
            cwd: string;
        };
    };
    // Keep other potential properties
    [key: string]: any;
}

async function updateClaudeConfig() {
    const platform = os.platform();
    const homeDir = os.homedir();
    let configPath: string = '';

    if (platform === 'darwin') {
        configPath = path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        configPath = path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    } else {
        console.error(`Unsupported platform: ${platform}. Please update config manually.`);
        process.exit(1);
    }

    const configDir = path.dirname(configPath);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const agentPackageDir = path.resolve(__dirname);

    console.log(`Checking Claude config at: ${configPath}`);

    let config: ClaudeDesktopConfig = {};
    try {
        await fs.access(configDir); // Check if directory exists
    } catch (error) {
        // Directory doesn't exist, try to create it
        try {
            await fs.mkdir(configDir, { recursive: true });
            console.log(`Created config directory: ${configDir}`);
        } catch (mkdirError) {
            console.error(`Failed to create config directory: ${mkdirError}`);
            process.exit(1);
        }
    }

    try {
        const rawConfig = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(rawConfig) as ClaudeDesktopConfig;
        console.log('Existing config found.');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('No existing config found, creating new one.');
            config = { mcpServers: {} };
        } else {
            console.error(`Error reading config file: ${error}`);
            process.exit(1);
        }
    }

    // Ensure mcpServers object exists
    if (!config.mcpServers) {
        config.mcpServers = {};
    }

    // Add or update the sapience server entry
    config.mcpServers['sapience'] = {
        command: 'npx', // Use npx to run the globally/locally installed package command
        args: ['@foil/agent', 'run-server'], // The new command defined in package.json
        cwd: agentPackageDir // Dynamically determined path to the agent package
    };

    console.log('Updated config object:', JSON.stringify(config, null, 2));


    try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`Successfully updated ${configPath}`);
        console.log(`\nConfiguration:`);
        console.log(`  Command: ${config.mcpServers["sapience"].command}`);
        console.log(`  Args: ${config.mcpServers["sapience"].args.join(' ')}`);
        console.log(`  Cwd: ${config.mcpServers["sapience"].cwd}`);

    } catch (error) {
        console.error(`Error writing config file: ${error}`);
        process.exit(1);
    }
}

updateClaudeConfig(); 