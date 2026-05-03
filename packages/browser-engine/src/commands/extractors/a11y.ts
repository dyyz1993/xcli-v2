import type { A11yNode } from './types';

export const A11Y_EXTRACTOR_FN = `
(function(selector) {
  function walk(node, depth) {
    if (!node || node.nodeType !== 1) return null;
    
    var tag = node.tagName;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD', 'HTML'].indexOf(tag) !== -1) return null;
    
    var role = node.getAttribute('role') || 
      (tag === 'BUTTON' ? 'button' :
       tag === 'A' ? 'link' :
       tag === 'INPUT' ? 'textbox' :
       tag === 'TEXTAREA' ? 'textbox' :
       tag === 'SELECT' ? 'combobox' :
       tag === 'IMG' ? 'img' :
       tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6' ? 'heading' :
       tag === 'UL' || tag === 'OL' ? 'list' :
       tag === 'LI' ? 'listitem' :
       tag === 'NAV' ? 'navigation' :
       tag === 'MAIN' ? 'main' :
       tag === 'HEADER' ? 'banner' :
       tag === 'FOOTER' ? 'contentinfo' :
       tag === 'FORM' ? 'form' :
       tag === 'TABLE' ? 'table' :
       tag === 'TR' ? 'row' :
       tag === 'TD' || tag === 'TH' ? 'cell' :
       null);
    
    var directText = '';
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (child.nodeType === 3) {
        var txt = (child.textContent || '').trim();
        if (txt) {
          directText += (directText ? ' ' : '') + txt;
        }
      }
    }
    
    var name = node.getAttribute('aria-label') ||
      node.getAttribute('alt') ||
      node.getAttribute('title') ||
      (tag === 'INPUT' || tag === 'TEXTAREA' ? node.getAttribute('placeholder') : '') ||
      (directText ? directText.slice(0, 100) : '');
    
    var cssSelector = '';
    if (node.id) {
      cssSelector = '#' + node.id;
    } else if (node.className && typeof node.className === 'string') {
      var classes = node.className.trim().split(/\\\\s+/).filter(function(c) { return c && !c.startsWith('reds-') && !c.startsWith('_'); });
      if (classes.length > 0) {
        cssSelector = '.' + classes.slice(0, 2).join('.');
      }
    }
    
    var result = {};
    if (role) result.role = role;
    if (name) result.name = name;
    result.tag = tag.toLowerCase();
    if (cssSelector) result.selector = cssSelector;
    if (tag === 'A' && node.href) result.href = node.href;
    if (node.disabled) result.disabled = true;
    
    var children = [];
    for (var i = 0; i < node.children.length; i++) {
      var childResult = walk(node.children[i], depth + 1);
      if (childResult) children.push(childResult);
    }
    
    if (children.length > 0) {
      result.children = children;
    }
    
    if (!role && !name && children.length === 0) return null;
    
    return result;
  }
  
  function toYaml(node, indent) {
    if (!node) return '';
    var spaces = '  '.repeat(indent);
    var lines = [];
    
    var header = '';
    if (node.role) {
      header = node.role;
      if (node.name) header += ' "' + node.name + '"';
    } else if (node.name) {
      header = node.name;
    } else {
      header = node.tag;
    }
    
    lines.push(spaces + '- ' + header);
    
    if (node.selector) {
      lines.push(spaces + '  selector: ' + node.selector);
    }
    if (node.href) {
      lines.push(spaces + '  href: ' + node.href);
    }
    if (node.disabled) {
      lines.push(spaces + '  disabled: true');
    }
    
    if (node.children && node.children.length > 0) {
      for (var i = 0; i < node.children.length; i++) {
        lines.push(toYaml(node.children[i], indent + 1));
      }
    }
    
    return lines.join('\\\\n');
  }
  
  var root = document.querySelector(selector) || document.body;
  var htmlSize = root.outerHTML.length;
  var result = walk(root, 0);
  var yaml = result ? toYaml(result, 0) : '';
  
  return {
    json: result,
    yaml: yaml,
    size: {
      html: htmlSize,
      extracted: yaml.length
    }
  };
})
`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function a11yToYaml(node: A11yNode | null, indent: number = 0): string {
  if (!node) return '';

  const spaces = '  '.repeat(indent);
  const lines: string[] = [];

  let header = '';
  if (node.role) {
    header = node.role;
    if (node.name) header += ` "${node.name}"`;
  } else if (node.name) {
    header = node.name;
  } else {
    header = node.tag;
  }

  lines.push(`${spaces}- ${header}`);

  if (node.selector) {
    lines.push(`${spaces}  selector: ${node.selector}`);
  }
  if (node.href) {
    lines.push(`${spaces}  href: ${node.href}`);
  }
  if (node.disabled) {
    lines.push(`${spaces}  disabled: true`);
  }

  if (node.children) {
    for (const child of node.children) {
      lines.push(a11yToYaml(child, indent + 1));
    }
  }

  return lines.join('\n');
}
