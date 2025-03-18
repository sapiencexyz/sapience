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
 * - Run: npx tsx src/generate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);

// Types for Solidity interface
type FunctionParam = {
  name: string;
  type: string;
  description?: string;
};

type StructField = {
  name: string;
  type: string;
  description?: string;
};

type StructDefinition = {
  name: string;
  description?: string;
  fields: StructField[];
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
  structs: StructDefinition[];
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
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Remove comment markers
    const cleanLine = trimmedLine.replace(/^\/\*\*|^\*\/|^\* ?/g, '').trim();
    
    if (!cleanLine) continue;

    // Match @param tag with name and description
    const paramMatch = cleanLine.match(/^@param\s+(\w+)\s+(.+)$/);
    if (paramMatch) {
      const [, name, desc] = paramMatch;
      natspec[`param_${name}`] = desc;
      continue;
    }

    // Match @return tag
    const returnMatch = cleanLine.match(/^@return\s+(\w+)\s+(.+)$/);
    if (returnMatch) {
      const [, name, desc] = returnMatch;
      natspec[`return_${name}`] = desc;
      continue;
    }

    // Match @dev tag
    if (cleanLine.startsWith('@dev ')) {
      natspec.dev = cleanLine.substring(5);
      continue;
    }
  }

  return natspec;
}

// Update the execPromise function to execute commands in the protocol directory
async function execInProtocolDir(command: string, retries = 3): Promise<{stdout: string, stderr: string}> {
  for (let i = 0; i < retries; i++) {
    try {
      // Add a timeout of 30 seconds
      const timeout = 30000;
      const result = await Promise.race([
        execPromise(`cd ../protocol && ${command}`),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Command timed out')), timeout)
        )
      ]) as {stdout: string, stderr: string};
      
      return result;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('All retry attempts failed');
}

// Update generateAST function to work with protocol directory and handle multiple files
async function generateAST(filePath: string): Promise<any> {
  try {
    console.log(`Generating AST for ${filePath}...`);
    
    // Run forge build in the protocol directory with --ast flag
    const { stdout, stderr } = await execInProtocolDir('forge build --ast');
    
    if (stderr) {
      console.warn('Forge build stderr:', stderr);
    }
    
    // Determine the output path - now relative to the protocol directory
    const contractName = path.basename(filePath, '.sol');
    const outputPath = path.join(
      '../protocol/out',
      contractName + '.sol',
      contractName + '.json'
    );
    
    // Check if file exists
    if (!fs.existsSync(outputPath)) {
      console.error('AST file not found at:', outputPath);
      return null;
    }
    
    // Read the AST from the output file
    const fileContent = fs.readFileSync(outputPath, 'utf8');
    console.log('Raw file content:', fileContent);
    
    const output = JSON.parse(fileContent);
    
    // Debug logging
    console.log('AST Output for', contractName, ':', JSON.stringify(output, null, 2));
    
    return output.ast;
  } catch (error) {
    console.error('Error generating AST with forge:', error);
    throw error;
  }
}

// Process AST to extract interface definition
function processAST(ast: any): InterfaceDefinition[] {
  const interfaces: InterfaceDefinition[] = [];
  
  // If ast is an array of strings, it's a list of struct definitions
  if (Array.isArray(ast) && ast.length > 0 && typeof ast[0] === 'string') {
    const structInterface: InterfaceDefinition = {
      name: 'IFoilStructs',
      description: 'Struct definitions for the Foil protocol',
      functions: [],
      structs: []
    };

    // Process each struct definition
    for (const structJson of ast) {
      try {
        const structDef = JSON.parse(structJson);
        const structDefinition: StructDefinition = {
          name: structDef.name,
          description: '',
          fields: structDef.members.map((member: any) => ({
            name: member.name,
            type: member.type,
            description: ''
          }))
        };
        structInterface.structs.push(structDefinition);
      } catch (error) {
        console.error('Error parsing struct definition:', error);
      }
    }

    if (structInterface.structs.length > 0) {
      interfaces.push(structInterface);
    }
    return interfaces;
  }
  
  function traverseNode(node: any) {
    if (node.nodeType === 'ContractDefinition' && node.contractKind === 'interface') {
      const contractNode = node as ContractDefinition;
      
      // Process interface
      const interfaceDef: InterfaceDefinition = {
        name: contractNode.name,
        description: '',
        functions: [],
        structs: []
      };

      // Extract interface documentation
      if (contractNode.documentation) {
        const natspec = parseNatSpec(contractNode.documentation.text);
        interfaceDef.description = natspec.dev || natspec.description || '';
      }

      // Process interface functions and structs
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
            
            // Process parameters
            funcNode.parameters.parameters.forEach((param) => {
              const paramName = param.name;
              const paramDesc = natspec[`param_${paramName}`] || '';
              functionDef.params.push({
                name: paramName,
                type: param.typeName.typeDescriptions.typeString,
                description: paramDesc
              });
            });

            // Process return values
            funcNode.returnParameters.parameters.forEach((param, index) => {
              const returnDesc = natspec[`return_${index}`] || '';
              functionDef.returns.push({
                name: param.name || `result${index}`,
                type: param.typeName.typeDescriptions.typeString,
                description: returnDesc
              });
            });
          }

          interfaceDef.functions.push(functionDef);
        } else if (childNode.nodeType === 'StructDefinition') {
          // Process struct
          const structDef: StructDefinition = {
            name: childNode.name,
            description: '',
            fields: []
          };

          // Extract struct documentation
          if (childNode.documentation) {
            const natspec = parseNatSpec(childNode.documentation.text);
            structDef.description = natspec.dev || natspec.description || '';
          }

          // Process struct fields
          childNode.members.forEach((member: any) => {
            const fieldName = member.name;
            const fieldDesc = structDef.description ? parseNatSpec(structDef.description)[`param_${fieldName}`] || '' : '';
            structDef.fields.push({
              name: fieldName,
              type: member.typeName.typeDescriptions.typeString,
              description: fieldDesc
            });
          });

          interfaceDef.structs.push(structDef);
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

// Helper function to format parameter name
function formatParamName(name: string): string {
  return name;
}

// Helper function to format parameter value
function formatParamValue(param: FunctionParam, name: string): string {
  if (solidityToTypeScript(param.type) === 'bigint') {
    return `BigInt(${formatParamName(name)})`;
  }
  return formatParamName(name);
}

// Helper function to generate function parameters
function generateFunctionParams(params: FunctionParam[]): string {
  return params.length > 0 
    ? ', ' + params.map(p => p.name === 'data' ? 'data: dataParam' : formatParamName(p.name)).join(', ')
    : '';
}

// Helper function to generate function args
function generateFunctionArgs(params: FunctionParam[]): string {
  return params.length > 0
    ? `args: [${params.map(p => formatParamValue(p, p.name === 'data' ? 'dataParam' : p.name)).join(', ')}],\n`
    : '';
}

// Helper function to generate return value handling
function generateReturnValue(returns: FunctionParam[]): string {
  if (returns.length === 1) {
    return '        return { result };\n';
  } else if (returns.length > 1) {
    return `        return {\n${
      returns.map((r, i) => 
        `          ${r.name}: (result as [${returns.map(r => solidityToTypeScript(r.type)).join(', ')}])[${i}],\n`
      ).join('')
    }        };\n`;
  } else {
    return '        return { success: true };\n';
  }
}

// Function to extract ABI from AST
function extractABIFromAST(ast: any): string[] {
  const abi: string[] = [];
  const structs: { [key: string]: any } = {};
  
  // First pass: collect all struct definitions
  function collectStructs(node: any) {
    if (node.nodeType === 'StructDefinition') {
      const structName = node.name;
      const members = node.members.map((m: any) => {
        const type = m.typeName.typeDescriptions.typeString;
        // Handle nested structs
        if (type.startsWith('struct ')) {
          const nestedStructName = type.split('struct ')[1];
          return {
            name: m.name,
            type: 'tuple',
            internalType: type,
            components: structs[nestedStructName] || []
          };
        }
        return {
          name: m.name,
          type: type,
          internalType: type
        };
      });
      structs[structName] = members;
      
      // Add struct definition to ABI
      abi.push(JSON.stringify({
        name: structName,
        type: 'struct',
        members: members
      }));
    }
    
    if (node.nodes) {
      for (const child of node.nodes) {
        collectStructs(child);
      }
    }
  }
  
  // Second pass: process functions and handle struct types
  function processNode(node: any) {
    if (node.nodeType === 'FunctionDefinition') {
      const inputs = node.parameters.parameters.map((p: any) => {
        const type = p.typeName.typeDescriptions.typeString;
        // If the type is a struct, expand it into its components
        if (type.startsWith('struct ')) {
          const structName = type.split('struct ')[1];
          if (structs[structName]) {
            return {
              name: p.name,
              type: 'tuple',
              internalType: type,
              components: structs[structName].map((m: any) => ({
                name: m.name,
                type: m.type,
                internalType: m.internalType,
                components: m.components
              }))
            };
          }
        }
        return {
          name: p.name,
          type: type,
          internalType: type
        };
      });
      
      const outputs = node.returnParameters.parameters.map((p: any) => {
        const type = p.typeName.typeDescriptions.typeString;
        // If the type is a struct, expand it into its components
        if (type.startsWith('struct ')) {
          const structName = type.split('struct ')[1];
          if (structs[structName]) {
            return {
              name: p.name || '',
              type: 'tuple',
              internalType: type,
              components: structs[structName].map((m: any) => ({
                name: m.name,
                type: m.type,
                internalType: m.internalType,
                components: m.components
              }))
            };
          }
        }
        return {
          name: p.name || '',
          type: type,
          internalType: type
        };
      });
      
      // Add function to ABI
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
  
  // First collect all structs
  collectStructs(ast);
  // Then process functions
  traverse(ast);
  
  return abi;
}

// Function to generate MCP tool definitions for an interface
function generateMCPTool(interfaceDefinition: InterfaceDefinition, abiPath: string): string {
  const { name, description, functions, structs } = interfaceDefinition;
  
  let output = `// MCP Tool for ${name}\n`;
  output += `import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';\n`;
  output += `import { base } from 'viem/chains';\n`;
  output += `import { privateKeyToAccount } from 'viem/accounts';\n\n`;
  
  // Import ABI
  output += `// Import ABI from Foundry artifacts\n`;
  output += `import abiJson from '${abiPath}';\n\n`;
  
  // Add BigInt handling helper function
  output += `// Helper function to convert BigInts to strings in objects\n`;
  output += `function replaceBigInts(obj: any): any {\n`;
  output += `    if (obj === null || obj === undefined) {\n`;
  output += `        return obj;\n`;
  output += `    }\n`;
  output += `    if (typeof obj === 'bigint') {\n`;
  output += `        return obj.toString();\n`;
  output += `    }\n`;
  output += `    if (Array.isArray(obj)) {\n`;
  output += `        return obj.map(replaceBigInts);\n`;
  output += `    }\n`;
  output += `    if (typeof obj === 'object') {\n`;
  output += `        return Object.fromEntries(\n`;
  output += `            Object.entries(obj).map(([key, value]) => [key, replaceBigInts(value)])\n`;
  output += `        );\n`;
  output += `    }\n`;
  output += `    return obj;\n`;
  output += `}\n\n`;
  
  // Process ABI and handle struct types
  output += `// Process ABI and handle struct types\n`;
  output += `const parsedABI = abiJson.map(item => {\n`;
  output += `  // Convert struct types to tuples\n`;
  output += `  if (item.type === 'function') {\n`;
  output += `    item.inputs = item.inputs.map((input: any) => {\n`;
  output += `      if (input.internalType?.startsWith('struct ')) {\n`;
  output += `        const structName = input.internalType.split('struct ')[1];\n`;
  output += `        if (structName.includes('.')) {\n`;
  output += `          const [_, actualStructName] = structName.split('.');\n`;
  output += `          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);\n`;
  output += `          if (structDef) {\n`;
  output += `            return { ...input, type: 'tuple', components: structDef.members };\n`;
  output += `          }\n`;
  output += `        }\n`;
  output += `      }\n`;
  output += `      return input;\n`;
  output += `    });\n`;
  output += `    item.outputs = item.outputs.map((output: any) => {\n`;
  output += `      if (output.internalType?.startsWith('struct ')) {\n`;
  output += `        const structName = output.internalType.split('struct ')[1];\n`;
  output += `        if (structName.includes('.')) {\n`;
  output += `          const [_, actualStructName] = structName.split('.');\n`;
  output += `          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);\n`;
  output += `          if (structDef) {\n`;
  output += `            return { ...output, type: 'tuple', components: structDef.members };\n`;
  output += `          }\n`;
  output += `        }\n`;
  output += `      }\n`;
  output += `      return output;\n`;
  output += `    });\n`;
  output += `  }\n`;
  output += `  return item;\n`;
  output += `});\n\n`;
  
  // Filter ABI to only include functions
  output += `// Filter ABI to only include functions\n`;
  output += `const functionABI = parsedABI.filter(item => item.type === 'function');\n\n`;

  // Generate TypeScript types for structs
  if (structs.length > 0) {
    output += `// TypeScript types for structs\n`;
    output += `export type ${name}Structs = {\n`;
    for (const struct of structs) {
      output += `  ${struct.name}: {\n`;
      for (const field of struct.fields) {
        const tsType = solidityToTypeScript(field.type);
        output += `    ${field.name}: ${tsType};\n`;
      }
      output += `  };\n`;
    }
    output += `};\n\n`;
  }
  
  // Create clients setup
  output += `// Configure viem clients\n`;
  output += `const publicClient = createPublicClient({\n`;
  output += `  chain: base,\n`;
  output += `  transport: http()\n`;
  output += `});\n\n`;
  
  output += `// Get private key from environment\n`;
  output += `const privateKey = process.env.PRIVATE_KEY;\n`;
  output += `const hasPrivateKey = !!privateKey;\n`;
  output += `const walletClient = hasPrivateKey ? createWalletClient({\n`;
  output += `  account: privateKeyToAccount(privateKey as \`0x\${string}\`),\n`;
  output += `  chain: base,\n`;
  output += `  transport: http()\n`;
  output += `}) : null;\n\n`;
  
  // Generate tool definitions for each function
  output += `// MCP Tool Definitions\n`;
  output += `export const ${name}Tools = {\n`;
  
  // Track function name counts for overloading
  const functionNameCounts: { [key: string]: number } = {};
  
  for (const func of functions) {
    // Handle function overloading
    const baseName = func.name;
    const count = (functionNameCounts[baseName] || 0) + 1;
    functionNameCounts[baseName] = count;
    const functionName = count > 1 ? `${baseName}${count}` : baseName;
    
    output += `  ${functionName}: {\n`;
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
    output += `    function: async ({ contractAddress${generateFunctionParams(func.params)} }) => {\n`;
    
    // Handle different function types differently
    if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
      // Read-only function
      output += `      try {\n`;
      output += `        const result = await publicClient.readContract({\n`;
      output += `          address: contractAddress as \`0x\${string}\`,\n`;
      output += `          abi: functionABI,\n`;
      output += `          functionName: "${func.name}",\n`;
      output += `          args: [${func.params.map(p => formatParamValue(p, p.name)).join(', ')}]\n`;
      output += `        });\n\n`;
      output += `        return { result: replaceBigInts(result) };\n`;
      output += `      } catch (error) {\n`;
      output += `        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };\n`;
      output += `      }\n`;
    } else {
      // Write function
      output += `      if (!hasPrivateKey) {\n`;
      output += `        return { error: "Private key not configured" };\n`;
      output += `      }\n\n`;
      output += `      try {\n`;
      output += `        const hash = await walletClient!.writeContract({\n`;
      output += `          address: contractAddress as \`0x\${string}\`,\n`;
      output += `          abi: functionABI,\n`;
      output += `          functionName: "${func.name}",\n`;
      output += `          args: [${func.params.map(p => formatParamValue(p, p.name)).join(', ')}]\n`;
      output += `        });\n\n`;
      output += `        return { hash };\n`;
      output += `      } catch (error) {\n`;
      output += `        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };\n`;
      output += `      }\n`;
    }
    
    output += `    }\n`;
    output += `  },\n\n`;
  }
  
  output += `};\n`;
  
  return output;
}

// Main function to generate tools
async function main() {
  try {
    // Get current directory using import.meta.url instead of __dirname
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    
    // Configuration - updated paths for protocol directory
    const interfacesDir = '../protocol/src/market/interfaces'; // Path to your Solidity interfaces
    const outputDir = path.join(currentDir, '../tools'); // Output to packages/mcp/src/tools directory
    const outDir = path.join(currentDir, '../out'); // Output to packages/mcp/src/out directory
    
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
    
    // Collect all ABIs into a single array
    const allABIs: string[] = [];
    
    // Process all interface files
    for (const filePath of interfaceFiles) {
      try {
        const fullPath = path.join(absoluteInterfacesDir, filePath);
        console.log(`Processing ${fullPath}...`);
        
        // Generate AST
        const ast = await generateAST(fullPath);
        
        if (!ast) {
          console.warn(`No AST generated for ${filePath}`);
          continue;
        }
        
        // Process AST
        const interfaces = processAST(ast);
        
        if (interfaces.length === 0) {
          console.warn(`No interfaces found in ${filePath}`);
          continue;
        }
        
        // Generate MCP tools for each interface
        for (const interfaceDefinition of interfaces) {
          // Generate MCP tool
          const toolCode = generateMCPTool(interfaceDefinition, '../out/abi.json');
          
          // Write output
          const outputPath = path.join(outputDir, `${interfaceDefinition.name}Tools.ts`);
          fs.writeFileSync(outputPath, toolCode);
          
          // Extract ABI and add to collection
          const abi = extractABIFromAST(ast);
          allABIs.push(...abi);
          
          console.log(`Generated MCP tool at ${outputPath}`);
        }
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }
    
    // Write consolidated ABI file as a single array
    const consolidatedAbiPath = path.join(outDir, 'abi.json');
    // Parse each ABI string to get the actual objects, then stringify once
    const parsedABIs = allABIs.map(abi => JSON.parse(abi));
    fs.writeFileSync(consolidatedAbiPath, JSON.stringify(parsedABIs, null, 2));
    console.log(`Saved consolidated ABI at ${consolidatedAbiPath}`);
    
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