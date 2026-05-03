export { layoutToYaml } from './layout-formatters';

import { LAYOUT_HELPER_CODE } from './layout-helpers';

export const LAYOUT_EXTRACTOR_FN = `
(function(selector) {
${LAYOUT_HELPER_CODE}
  function buildLayout(el, depth) {
    if (excludeTags.has(el.tagName)) return null;
    if (depth > 12) return null;

    var tag = el.tagName.toLowerCase();
    var selector = getSelector(el);
    var keywords = extractKeywords(el);
    var region = getRegionType(el);
    var counts = countInteractive(el);
    var hidden = isHidden(el);
    var active = isActive(el);
    var htmlSize = el.outerHTML.length;

    var node = { type: tag };
    if (selector) node.selector = selector;
    if (keywords.length > 0) node.keywords = keywords.slice(0, 3);
    if (region) node.region = region;
    if (hidden) node.isHidden = true;
    if (active) node.isActive = true;

    if (htmlSize >= 1024) {
      node.size = formatSize(htmlSize);
    }

    if (isSearchInput(el)) {
      node.hasSearch = true;
    }

    if (region === "form" || counts.inputs > 0) {
      node.hasForm = true;
      if (counts.inputs > 0) node.inputCount = counts.inputs;
      if (counts.buttons > 0) node.buttonCount = counts.buttons;
    }

    if (counts.links > 0 && counts.links <= 10) {
      node.linkCount = counts.links;
    }

    var directChildren = Array.from(el.children).filter(shouldInclude);
    var groups = groupChildren(directChildren);

    if (groups.length > 0) {
      var children = [];
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var childNode = buildLayout(group.element, depth + 1);
        if (childNode) {
          if (group.count > 1) {
            childNode.repeatCount = group.count;
          }
          children.push(childNode);
        }
      }
      if (children.length > 0) {
        node.children = children;
      }
    }

    return node;
  }

  function toYaml(node, indent) {
    if (!node) return "";
    var spaces = "  ".repeat(indent);
    var line = spaces;

    var selector = node.selector || node.type;
    var parts = [];
    var seen = new Set();

    function addPart(p) {
      if (!seen.has(p)) {
        seen.add(p);
        parts.push(p);
      }
    }

    if (node.role) addPart(node.role);
    if (node.region) addPart(node.region);
    if (node.keywords) {
      for (var i = 0; i < node.keywords.length; i++) {
        addPart(node.keywords[i]);
      }
    }
    if (node.isHidden) addPart("hidden");
    if (node.isActive) addPart("active");
    if (node.hasSearch) addPart("search");
    if (node.hasForm) addPart("form");
    if (node.inputCount) addPart("i:" + node.inputCount);
    if (node.buttonCount) addPart("b:" + node.buttonCount);
    if (node.linkCount) addPart("l:" + node.linkCount);
    if (node.repeatCount) addPart("×" + node.repeatCount);
    if (node.size) addPart(node.size);
    if (node.a11ySize) addPart("a11y:" + node.a11ySize);

    if (parts.length > 0) {
      line += selector + ": [" + parts.join(" ") + "]";
    } else {
      line += selector + ": [" + node.type + "]";
    }

    var result = line + "\\\\n";

    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        result += toYaml(node.children[i], indent + 1);
      }
    }

    return result;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
    return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  }

  var root = document.querySelector(selector) || document.body;
  var layout = buildLayout(root, 0);
  var yaml = toYaml(layout, 0);

  return {
    json: layout,
    yaml: yaml,
    size: {
      html: root.outerHTML.length,
      extracted: yaml.length
    }
  };
})
`;
