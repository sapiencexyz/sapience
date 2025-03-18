#!/usr/bin/env tsx
/**
 * Solidity Interface to MCP Tool Generator
 * 
 * This script parses Solidity interface files using Foundry's AST output
 * and generates MCP tool definitions with viem integration.
 * 
 * Requirements:
 * - Foundry (forge) must be installed and available in PATH
 * - Node.js and npm/yarn
 * 
 * Dependencies:
 * - tsx, typescript, glob, viem
 * 
 * Usage:
 * - Run this script from the packages/mcp directory
 * - It will interact with the Forge project in ../../protocol
 * - Run: npx tsx src/index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

const execPromise = promisify(exec);

// Types for Solidity interface
type FunctionParam = {
  name: string;
  type: string;
  description?: string;
};

type FunctionDefinition = {
  name: string;
  description?: string;
  params: FunctionParam[];
  returns: FunctionParam[];
  stateMutability: string;
  isPayable: boolean;
};

type InterfaceDefinition = {
  name: string;
  description?: string;
  functions: FunctionDefinition[];
};

// Note: This script requires Foundry (forge) to be installed and in your PATH
// It uses forge to generate AST for Solidity interfaces

// AST Node types
interface ASTNode {
  id: number;
  nodeType: string;
  src: string;
  [key: string]: any;
}

interface ContractDefinition extends ASTNode {
  name: string;
  documentation?: { text: string };
  contractKind: string;
  nodes: ASTNode[];
}

interface FunctionDefinitionNode extends ASTNode {
  name: string;
  documentation?: { text: string };
  parameters: { parameters: ParameterNode[] };
  returnParameters: { parameters: ParameterNode[] };
  stateMutability: string;
  visibility: string;
}

interface ParameterNode extends ASTNode {
  name: string;
  typeName: { name?: string; typeDescriptions: { typeString: string } };
}

// Parse NatSpec comments
function parseNatSpec(docString?: string): { [key: string]: string } {
  if (!docString) return {};

  const natspec: { [key: string]: string } = {};
  const lines = docString.split('\n');

  let currentTag = 'description';
  let currentValue = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comment markers
    if (trimmedLine === '' || trimmedLine === '*' || trimmedLine.startsWith('/**') || trimmedLine.startsWith('*/')) {
      continue;
    }

    // Remove leading * if present
    const cleanLine = trimmedLine.startsWith('*') ? trimmedLine.substring(1).trim() : trimmedLine;

    // Check if this is a tag
    const tagMatch = cleanLine.match(/^@(\w+)(?:\s+(.*))?$/);
    if (tagMatch) {
      // Save the previous tag value
      if (currentValue) {
        natspec[currentTag] = currentValue.trim();
        currentValue = '';
      }
      
      currentTag = tagMatch[1];
      currentValue = tagMatch[2] || '';
    } else {
      // Append to current value
      if (currentValue) currentValue += ' ';
      currentValue += cleanLine;
    }
  }

  // Save the last tag value
  if (currentValue) {
    natspec[currentTag] = currentValue.trim();
  }

  return natspec;
}

// Update the execPromise function to execute commands in the protocol directory
async function execInProtocolDir(command: string): Promise<{stdout: string, stderr: string}> {
  return execPromise(`cd ../protocol && ${command}`);
}

// Update generateAST function to work with protocol directory
async function generateAST(filePath: string): Promise<any> {
  try {
    // Run forge build in the protocol directory with --ast flag
    await execInProtocolDir(`forge build --ast`);
    
    // Determine the output path - now relative to the protocol directory
    const contractName = path.basename(filePath, '.sol');
    const outputPath = path.join(
      '../protocol/out',
      contractName + '.sol',
      contractName + '.json'
    );
    
    // Read the AST from the output file
    const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return output.ast;
  } catch (error) {
    console.error('Error generating AST with forge:', error);
    throw error;
  }
}

// Process AST to extract interface definition
function processAST(ast: any): InterfaceDefinition[] {
  const interfaces: InterfaceDefinition[] = [];

  function traverseNode(node: ASTNode) {
    if (node.nodeType === 'ContractDefinition' && node.contractKind === 'interface') {
      const contractNode = node as ContractDefinition;
      
      // Process interface
      const interfaceDef: InterfaceDefinition = {
        name: contractNode.name,
        description: '',
        functions: []
      };

      // Extract interface documentation
      if (contractNode.documentation) {
        const natspec = parseNatSpec(contractNode.documentation.text);
        interfaceDef.description = natspec.dev || natspec.description || '';
      }

      // Process interface functions
      for (const childNode of contractNode.nodes) {
        if (childNode.nodeType === 'FunctionDefinition' && childNode.visibility === 'external') {
          const funcNode = childNode as FunctionDefinitionNode;
          
          // Process function
          const functionDef: FunctionDefinition = {
            name: funcNode.name,
            description: '',
            params: [],
            returns: [],
            stateMutability: funcNode.stateMutability,
            isPayable: funcNode.stateMutability === 'payable'
          };

          // Extract function documentation
          if (funcNode.documentation) {
            const natspec = parseNatSpec(funcNode.documentation.text);
            functionDef.description = natspec.dev || natspec.description || '';
            
            // Match param descriptions
            const paramDocs: { [key: string]: string } = {};
            const returnDocs: string[] = [];
            
            Object.entries(natspec).forEach(([key, value]) => {
              if (key.startsWith('param')) {
                const paramName = key.substring(5).trim();
                paramDocs[paramName] = value;
              } else if (key === 'return' || key.startsWith('return')) {
                returnDocs.push(value);
              }
            });

            // Process parameters
            funcNode.parameters.parameters.forEach((param, index) => {
              functionDef.params.push({
                name: param.name,
                type: param.typeName.typeDescriptions.typeString,
                description: paramDocs[param.name] || ''
              });
            });

            // Process return values
            funcNode.returnParameters.parameters.forEach((param, index) => {
              functionDef.returns.push({
                name: param.name || `result${index}`,
                type: param.typeName.typeDescriptions.typeString,
                description: returnDocs[index] || ''
              });
            });
          }

          interfaceDef.functions.push(functionDef);
        }
      }

      interfaces.push(interfaceDef);
    }

    // Recursively process child nodes
    if (node.nodes) {
      for (const childNode of node.nodes) {
        traverseNode(childNode);
      }
    }
  }

  traverseNode(ast);
  return interfaces;
}

// Function to convert Solidity type to TypeScript type
function solidityToTypeScript(solidityType: string): string {
  // Handle array types
  if (solidityType.includes('[]')) {
    const baseType = solidityType.replace(/\[\d*\]/g, '');
    return `${solidityToTypeScript(baseType)}[]`;
  }
  
  // Basic mappings
  if (solidityType.startsWith('uint') || solidityType.startsWith('int')) {
    return 'bigint';
  }
  
  if (solidityType === 'bool') {
    return 'boolean';
  }
  
  if (solidityType === 'address') {
    return 'string'; // Ethereum addresses are represented as strings in TS
  }
  
  if (solidityType === 'string' || solidityType.startsWith('bytes')) {
    return 'string';
  }
  
  // For tuples and other complex types
  if (solidityType.includes('tuple')) {
    return 'object';
  }
  
  // Default fallback
  return 'any';
}

// Function to format description
function formatDescription(description: string): string {
  if (!description) return '';
  return description.replace(/\n/g, ' ').trim();
}

// Function to generate MCP tool definitions for an interface
function generateMCPTool(interfaceDefinition: InterfaceDefinition, abiPath: string): string {
  const { name, description, functions } = interfaceDefinition;
  
  let output = `// MCP Tool for ${name}\n`;
  output += `import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';\n`;
  output += `import { base } from 'viem/chains';\n\n`;
  
  // Import ABI
  output += `// Import ABI from Foundry artifacts\n`;
  output += `import ${name}ABI from '${abiPath}';\n\n`;
  
  // Create client setup
  output += `// Configure viem client\n`;
  output += `const client = createPublicClient({\n`;
  output += `  chain: base,\n`;
  output += `  transport: http()\n`;
  output += `});\n\n`;
  
  // Generate tool definitions for each function
  output += `// MCP Tool Definitions\n`;
  output += `export const ${name}Tools = {\n`;
  
  for (const func of functions) {
    output += `  ${func.name}: {\n`;
    output += `    description: ${JSON.stringify(formatDescription(func.description || `Call ${func.name} function on ${name} contract`))},\n`;
    output += `    parameters: {\n`;
    output += `      type: "object",\n`;
    output += `      properties: {\n`;
    output += `        contractAddress: {\n`;
    output += `          type: "string",\n`;
    output += `          description: "The address of the contract to interact with"\n`;
    output += `        },\n`;
    
    // Add function parameters
    for (const param of func.params) {
      const tsType = solidityToTypeScript(param.type);
      output += `        ${param.name}: {\n`;
      // Handle bigint for JSON Schema
      output += `          type: "${tsType === 'bigint' ? 'string' : typeof tsType === 'string' ? tsType : 'string'}",\n`;
      if (param.description) {
        output += `          description: ${JSON.stringify(formatDescription(param.description))},\n`;
      }
      output += `        },\n`;
    }
    
    output += `      },\n`;
    output += `      required: ["contractAddress"${func.params.length > 0 ? ', ' + func.params.map(p => `"${p.name}"`).join(', ') : ''}]\n`;
    output += `    },\n`;
    
    // Function implementation
    output += `    function: async ({ contractAddress${func.params.length > 0 ? ', ' + func.params.map(p => p.name).join(', ') : ''} }) => {\n`;
    
    // Handle different function types differently
    if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
      // Read-only function
      output += `      try {\n`;
      output += `        const result = await client.readContract({\n`;
      output += `          address: contractAddress,\n`;
      output += `          abi: parseAbi(${name}ABI),\n`;
      output += `          functionName: "${func.name}",\n`;
      
      if (func.params.length > 0) {
        output += `          args: [${func.params.map(p => {
          // Format bigint parameters correctly
          if (solidityToTypeScript(p.type) === 'bigint') {
            return `BigInt(${p.name})`;
          }
          return p.name;
        }).join(', ')}],\n`;
      }
      
      output += `        });\n\n`;
      
      if (func.returns.length === 1) {
        output += `        return { result };\n`;
      } else if (func.returns.length > 1) {
        // Handle multiple return values
        output += `        return {\n`;
        for (let i = 0; i < func.returns.length; i++) {
          const returnParam = func.returns[i];
          output += `          ${returnParam.name}: result[${i}],\n`;
        }
        output += `        };\n`;
      } else {
        output += `        return { success: true };\n`;
      }
      
      output += `      } catch (error) {\n`;
      output += `        return { error: error.message };\n`;
      output += `      }\n`;
    } else {
      // Write function
      output += `      try {\n`;
      output += `        // Prepare transaction data\n`;
      output += `        const data = encodeFunctionData({\n`;
      output += `          abi: parseAbi(${name}ABI),\n`;
      output += `          functionName: "${func.name}",\n`;
      
      if (func.params.length > 0) {
        output += `          args: [${func.params.map(p => {
          // Format bigint parameters correctly
          if (solidityToTypeScript(p.type) === 'bigint') {
            return `BigInt(${p.name})`;
          }
          return p.name;
        }).join(', ')}],\n`;
      }
      
      output += `        });\n\n`;
      
      output += `        // For MCP we return the transaction data that should be executed\n`;
      output += `        return {\n`;
      output += `          to: contractAddress,\n`;
      output += `          data,\n`;
      if (func.isPayable) {
        output += `          value: "0", // Caller should specify the actual value\n`;
      }
      output += `          description: \`Calling ${func.name} on \${contractAddress}\`\n`;
      output += `        };\n`;
      
      output += `      } catch (error) {\n`;
      output += `        return { error: error.message };\n`;
      output += `      }\n`;
    }
    
    output += `    }\n`;
    output += `  },\n\n`;
  }
  
  output += `};\n`;
  
  return output;
}

// Function to extract ABI from AST
function extractABIFromAST(ast: any): string[] {
  const abi: string[] = [];
  
  function processNode(node: any) {
    if (node.nodeType === 'FunctionDefinition') {
      const inputs = node.parameters.parameters.map((p: any) => ({
        name: p.name,
        type: p.typeName.typeDescriptions.typeString,
        internalType: p.typeName.typeDescriptions.typeString
      }));
      
      const outputs = node.returnParameters.parameters.map((p: any) => ({
        name: p.name || '',
        type: p.typeName.typeDescriptions.typeString,
        internalType: p.typeName.typeDescriptions.typeString
      }));
      
      abi.push(JSON.stringify({
        inputs,
        outputs,
        stateMutability: node.stateMutability,
        type: 'function',
        name: node.name
      }));
    }
  }
  
  function traverse(node: any) {
    processNode(node);
    if (node.nodes) {
      for (const child of node.nodes) {
        traverse(child);
      }
    }
  }
  
  traverse(ast);
  return abi;
}

// Update main function with the correct output directory
async function main() {
  try {
    // Configuration - updated paths for protocol directory
    const interfacesDir = '../protocol/src/market/interfaces'; // Path to your Solidity interfaces
    const outputDir = path.join(__dirname, '../tools'); // Output to packages/mcp/src/tools directory
    const outDir = path.join(__dirname, '../out'); // Output to packages/mcp/src/out directory
    
    // Create output directories if they don't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    // Debug: Log the absolute path we're searching in
    const absoluteInterfacesDir = path.resolve(interfacesDir);
    console.log('Searching for interfaces in:', absoluteInterfacesDir);
    
    // Find all interface files with a simpler glob pattern
    const interfaceFiles = await glob('*.sol', {
      cwd: absoluteInterfacesDir,
      ignore: ['**/mocks/**', '**/external/**']
    });
    
    if (interfaceFiles.length === 0) {
      console.warn('No interface files found in:', absoluteInterfacesDir);
      return;
    }
    
    console.log(`Found ${interfaceFiles.length} interface files to process`);
    
    for (const filePath of interfaceFiles) {
      try {
        const fullPath = path.join(absoluteInterfacesDir, filePath);
        console.log(`Processing ${fullPath}...`);
        
        // Generate AST
        const ast = await generateAST(fullPath);
        
        // Process AST
        const interfaces = processAST(ast);
        
        if (interfaces.length === 0) {
          console.warn(`No interfaces found in ${filePath}`);
          continue;
        }
        
        // Generate MCP tools for each interface
        for (const interfaceDefinition of interfaces) {
          // Determine ABI path - update path to be relative to our output directory
          const relativeAbiPath = `../out/${interfaceDefinition.name}.ast.json`;
          
          // Generate MCP tool
          const toolCode = generateMCPTool(interfaceDefinition, relativeAbiPath);
          
          // Write output
          const outputPath = path.join(outputDir, `${interfaceDefinition.name}Tools.ts`);
          fs.writeFileSync(outputPath, toolCode);
          
          // Save the ABI to our out directory
          const astOutputPath = path.join(outDir, `${interfaceDefinition.name}.ast.json`);
          const abi = extractABIFromAST(ast);
          fs.writeFileSync(astOutputPath, JSON.stringify(abi, null, 2));
          
          console.log(`Generated MCP tool at ${outputPath}`);
          console.log(`Saved ABI at ${astOutputPath}`);
        }
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }
    
    // Generate index file in tools directory
    const toolFiles = await glob(`${outputDir}/*Tools.ts`);
    const toolNames = toolFiles.map(filePath => path.basename(filePath, '.ts'));
    
    if (toolNames.length === 0) {
      console.warn('No tool files were generated');
      return;
    }
    
    let indexContent = `// Generated MCP Tools Index\n\n`;
    
    for (const name of toolNames) {
      indexContent += `export * from './${name}';\n`;
    }
    
    fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent);
    
    console.log('Successfully generated all MCP tools!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});