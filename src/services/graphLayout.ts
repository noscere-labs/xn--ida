/**
 * Graph Layout Service
 *
 * Handles hierarchical layout positioning for transaction graph nodes
 */

import { GraphData, TxGraphNode, LayoutConfig } from '../types/txGraph';

export class GraphLayout {
  private config: LayoutConfig = {
    nodeWidth: 180,
    nodeHeight: 60,
    levelHeight: 150,
    minNodeSpacing: 40,
    paddingX: 100,
    paddingY: 100,
  };

  public calculateLayout(graphData: GraphData): { width: number; height: number } {
    // Group nodes by level
    const nodesByLevel = this.groupNodesByLevel(graphData.nodes);

    // Calculate SVG dimensions
    const maxNodesInLevel = Math.max(...Array.from(nodesByLevel.values()).map(nodes => nodes.length));
    const svgWidth = Math.max(
      1200,
      maxNodesInLevel * (this.config.nodeWidth + this.config.minNodeSpacing) + 2 * this.config.paddingX
    );
    const svgHeight = nodesByLevel.size * this.config.levelHeight + 2 * this.config.paddingY;

    // Position nodes level by level
    nodesByLevel.forEach((nodes, level) => {
      this.positionNodesAtLevel(nodes, level, svgWidth);
    });

    return { width: svgWidth, height: svgHeight };
  }

  private groupNodesByLevel(nodes: Map<string, TxGraphNode>): Map<number, TxGraphNode[]> {
    const grouped = new Map<number, TxGraphNode[]>();

    nodes.forEach(node => {
      if (!grouped.has(node.level)) {
        grouped.set(node.level, []);
      }
      grouped.get(node.level)!.push(node);
    });

    return grouped;
  }

  private positionNodesAtLevel(nodes: TxGraphNode[], level: number, svgWidth: number): void {
    const y = this.config.paddingY + level * this.config.levelHeight;
    const availableWidth = svgWidth - 2 * this.config.paddingX;
    const spacing = nodes.length > 1 ? availableWidth / (nodes.length + 1) : availableWidth / 2;

    nodes.forEach((node, index) => {
      node.position.x = this.config.paddingX + spacing * (index + 1);
      node.position.y = y;
    });
  }

  public getConfig(): LayoutConfig {
    return { ...this.config };
  }

  public setConfig(config: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const graphLayout = new GraphLayout();
