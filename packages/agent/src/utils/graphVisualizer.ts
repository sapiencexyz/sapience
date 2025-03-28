import fs from 'fs';
import path from 'path';
import { StateGraph } from "@langchain/langgraph";
import { execSync } from 'child_process';

export class GraphVisualizer {
  static async saveDiagram(graph: StateGraph<any, any, any, any>, outputDir: string = 'docs'): Promise<void> {
    console.log('Starting graph visualization...');
    try {
      // Get the graph representation using type assertion
      console.log('Getting graph representation...');
      const representation = (graph as any).graph;
      console.log('Graph representation:', representation);
      
      // Generate PNG
      console.log('Generating PNG...');
      const image = await representation.drawMermaidPng();
      const arrayBuffer = await image.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        console.log(`Creating output directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save PNG
      const pngPath = path.join(outputDir, 'graph.png');
      fs.writeFileSync(pngPath, buffer);
      
      // Save mermaid definition
      const mmdPath = path.join(outputDir, 'graph.mmd');
      fs.writeFileSync(mmdPath, representation.mermaid);
      
      // Save as markdown for documentation
      const mdPath = path.join(outputDir, 'graph.md');
      const markdown = `# Agent Graph Visualization\n\n\`\`\`mermaid\n${representation.mermaid}\n\`\`\`\n`;
      fs.writeFileSync(mdPath, markdown);
      
      console.log(`Graph visualization saved to ${outputDir}/`);
    } catch (error) {
      console.error('Failed to generate graph visualization:', error);
      // Fallback to basic mermaid diagram if PNG generation fails
      console.log('Falling back to basic diagram generation...');
      const basicDiagram = this.generateBasicMermaidDiagram(graph);
      const outputDir = 'docs';
      
      if (!fs.existsSync(outputDir)) {
        console.log(`Creating output directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const mmdPath = path.join(outputDir, 'graph.mmd');
      fs.writeFileSync(mmdPath, basicDiagram);
      
      const mdPath = path.join(outputDir, 'graph.md');
      const markdown = `# Agent Graph Visualization\n\n\`\`\`mermaid\n${basicDiagram}\n\`\`\`\n`;
      fs.writeFileSync(mdPath, markdown);
      
      console.log(`Basic graph visualization saved to ${outputDir}/`);

      // Convert Mermaid to PNG using mermaid-cli
      try {
        console.log('Converting Mermaid to PNG using mermaid-cli...');
        const pngPath = path.join(outputDir, 'graph.png');
        execSync(`npx @mermaid-js/mermaid-cli -i ${mmdPath} -o ${pngPath}`, { stdio: 'inherit' });
        console.log('PNG generated successfully');
      } catch (cliError) {
        console.error('Failed to generate PNG using mermaid-cli:', cliError);
      }
    }
  }

  private static generateBasicMermaidDiagram(graph: StateGraph<any, any, any, any>): string {
    console.log('Generating basic diagram...');
    // Create a mermaid graph definition
    let diagram = 'graph TD;\n';
    
    // Get all nodes from the graph
    console.log('Graph nodes:', graph.nodes);
    const nodes = graph.nodes;
    
    // Add nodes with styling
    Object.keys(nodes).forEach(nodeName => {
      const isTool = nodeName === 'tools';
      // Special case for lookup node to show as "Lookup Positions"
      const displayName = nodeName === 'lookup' 
        ? 'Lookup Positions'
        : nodeName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      diagram += `  ${nodeName}[${displayName}]:::${isTool ? 'tool' : 'node'};\n`;
    });
    
    // Add edges based on the graph structure
    console.log('Graph edges:', graph.edges);
    const edges = Array.from(graph.edges as Set<[string, string]>);
    edges.forEach(([fromNode, toNode]) => {
      // Skip the __start__ node as it's just a helper node
      if (fromNode !== '__start__') {
        // For edges to tools node, use a dotted line
        if (toNode === 'tools') {
          diagram += `  ${fromNode} -.-> ${toNode};\n`;
        } else {
          diagram += `  ${fromNode} --> ${toNode};\n`;
        }
      }
    });
    
    // Add styling
    diagram += '\nclassDef node fill:#f9f,stroke:#333,stroke-width:2px;\n';
    diagram += 'classDef tool fill:#bbf,stroke:#333,stroke-width:2px;\n';
    
    return diagram;
  }
} 