import type { LayoutNode } from './types';

export function layoutToYaml(node: LayoutNode | null, indent: number = 0): string {
  if (!node) return '';

  const spaces = '  '.repeat(indent);
  const selector = node.selector || node.type;
  const parts: string[] = [];
  const seen = new Set<string>();

  const addPart = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      parts.push(p);
    }
  };

  if (node.role) addPart(node.role);
  if (node.region) addPart(node.region);
  if (node.keywords) {
    for (const k of node.keywords) {
      addPart(k);
    }
  }
  if (node.isHidden) addPart('hidden');
  if (node.isActive) addPart('active');
  if (node.hasSearch) addPart('search');
  if (node.hasForm) addPart('form');
  if (node.inputCount) addPart(`i:${node.inputCount}`);
  if (node.buttonCount) addPart(`b:${node.buttonCount}`);
  if (node.linkCount) addPart(`l:${node.linkCount}`);
  if (node.repeatCount) addPart(`×${node.repeatCount}`);
  if (node.size) addPart(node.size);
  if (node.a11ySize) addPart(`a11y:${node.a11ySize}`);

  let line = '';
  if (parts.length > 0) {
    line = `${spaces}${selector}: [${parts.join(' ')}]`;
  } else {
    line = `${spaces}${selector}: [${node.type}]`;
  }

  let result = line + '\n';

  if (node.children) {
    for (const child of node.children) {
      result += layoutToYaml(child, indent + 1);
    }
  }

  return result;
}
