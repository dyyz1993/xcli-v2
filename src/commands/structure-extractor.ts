import { STRUCTURE_SELECTOR_CODE } from './structure-selector.js';

export const STRUCTURE_EXTRACTOR_CODE = `(function(opts) {
${STRUCTURE_SELECTOR_CODE}
  var SIZE_THRESHOLD = 1 * 1024;
  var MIN_SIZE = 50;

  function getRegionType(el) {
    var tag = el.tagName;
    var role = el.getAttribute("role");
    if (role === "navigation" || tag === "NAV") return "nav";
    if (role === "banner" || tag === "HEADER") return "header";
    if (role === "contentinfo" || tag === "FOOTER") return "footer";
    if (role === "main" || tag === "MAIN") return "main";
    if (role === "complementary" || tag === "ASIDE") return "sidebar";
    return null;
  }

  function getListType(el) {
    var tag = el.tagName;
    var role = el.getAttribute("role");
    var className = (el.className || "").toString().toLowerCase();
    
    if (["UL", "OL", "DL", "MENU"].indexOf(tag) !== -1) return "list";
    if (role === "list") return "list";
    if (role === "grid") return "grid";
    if (className.indexOf("carousel") !== -1 || className.indexOf("feed") !== -1) return "feed";
    return null;
  }

  function isHidden(el) {
    if (el === document.body || el === document.documentElement) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;
    if (el.hasAttribute("hidden")) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    return false;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + "B";
    var kb = bytes / 1024;
    if (kb < 1024) {
      var str = kb.toFixed(1);
      if (str.endsWith(".0")) str = str.slice(0, -2);
      return str + "KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  }

  function calculateA11ySize(el) {
    function walk(node) {
      var tag = node.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD", "HTML", "SVG", "PATH", "G"].indexOf(tag) !== -1) return 0;
      
      var role = node.getAttribute("role") || 
        (tag === "BUTTON" ? "button" : 
         tag === "A" ? "link" : 
         tag === "INPUT" ? "textbox" : 
         tag === "TEXTAREA" ? "textbox" :
         tag === "SELECT" ? "combobox" :
         tag === "IMG" ? "img" :
         tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6" ? "heading" :
         tag === "UL" || tag === "OL" ? "list" :
         tag === "LI" ? "listitem" :
         tag === "NAV" ? "navigation" :
         tag === "MAIN" ? "main" :
         tag === "HEADER" ? "banner" :
         tag === "FOOTER" ? "contentinfo" :
         tag === "FORM" ? "form" :
         null);

      var name = node.getAttribute("aria-label") ||
        node.getAttribute("alt") ||
        node.getAttribute("title") ||
        (tag === "INPUT" || tag === "TEXTAREA" ? node.getAttribute("placeholder") : "");

      var directText = "";
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3) {
          var txt = (child.textContent || "").trim();
          if (txt) directText += (directText ? " " : "") + txt;
        }
      }

      var finalName = name || (directText ? directText.slice(0, 100) : "");
      var size = (role || finalName) ? ("- " + (role || "item") + (finalName ? ' "' + finalName.slice(0, 50) + '"' : "") + "\\n").length : 0;

      for (var i = 0; i < node.children.length; i++) {
        size += walk(node.children[i]);
      }

      return size;
    }

    return walk(el);
  }

  function countChildren(el) {
    var count = 0;
    for (var i = 0; i < el.children.length; i++) {
      var child = el.children[i];
      if (!excludeTags.has(child.tagName) && !isHidden(child)) {
        count++;
      }
    }
    return count;
  }

  function collectContainers(el, depth) {
    if (excludeTags.has(el.tagName) || isHidden(el)) return { containers: [], lists: [] };

    var a11ySize = calculateA11ySize(el);
    var selector = getUniqueSelector(el, 5);
    var region = getRegionType(el);
    var listType = getListType(el);
    var childCount = countChildren(el);

    if (!selector) {
      var result = { containers: [], lists: [] };
      for (var i = 0; i < el.children.length; i++) {
        var childResult = collectContainers(el.children[i], depth);
        result.containers = result.containers.concat(childResult.containers);
        result.lists = result.lists.concat(childResult.lists);
      }
      return result;
    }

    if (listType && childCount >= 3) {
      if (a11ySize < MIN_SIZE) {
        return { containers: [], lists: [] };
      }
      
      var listSelector = getUniqueSelector(el, 5) || getSelector(el);
      if (!listSelector) {
        listSelector = el.tagName.toLowerCase();
      }
      
      var sampleItem = null;
      for (var i = 0; i < el.children.length; i++) {
        var child = el.children[i];
        if (!excludeTags.has(child.tagName) && !isHidden(child)) {
          var childSelector = getUniqueSelector(child, 3) || getSelector(child);
          var childSize = calculateA11ySize(child);
          if (childSelector && childSize >= MIN_SIZE) {
            sampleItem = { selector: childSelector, size: childSize };
            break;
          }
        }
      }
      
      var containerSelector = getUniqueSelector(el, 5);
      
      return {
        containers: containerSelector ? [{ selector: containerSelector, size: a11ySize, depth: depth, region: region }] : [],
        lists: [{ 
          selector: listSelector, 
          type: listType, 
          count: childCount, 
          size: a11ySize,
          item: sampleItem
        }]
      };
    }

    if (a11ySize < SIZE_THRESHOLD) {
      if (a11ySize < MIN_SIZE) {
        return { containers: [], lists: [] };
      }
      return {
        containers: [{ selector: selector, size: a11ySize, depth: depth, region: region }],
        lists: []
      };
    }

    var childContainers = [];
    var childLists = [];
    for (var i = 0; i < el.children.length; i++) {
      var childResult = collectContainers(el.children[i], depth + 1);
      childContainers = childContainers.concat(childResult.containers);
      childLists = childLists.concat(childResult.lists);
    }

    if (childContainers.length === 0) {
      return {
        containers: [{ selector: selector, size: a11ySize, depth: depth, region: region }],
        lists: childLists
      };
    }

    return {
      containers: childContainers,
      lists: childLists
    };
  }

  var root = document.querySelector(opts.selector);
  if (!root) return { layout: null, yaml: "", error: "Element not found" };

  var result = collectContainers(root, 0);
  var containers = result.containers;
  var lists = result.lists;

  function mergeLists(lists) {
    var merged = {};
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      var key = list.selector;
      if (merged[key]) {
        merged[key].count += list.count;
        merged[key].size += list.size;
        merged[key].totalCount = (merged[key].totalCount || 1) + 1;
      } else {
        merged[key] = {
          selector: list.selector,
          type: list.type,
          count: list.count,
          size: list.size,
          item: list.item,
          totalCount: 1
        };
      }
    }
    
    var result = [];
    for (var key in merged) {
      var list = merged[key];
      if (list.totalCount > 1) {
        list.count = list.totalCount + "个列表";
      }
      result.push(list);
    }
    return result;
  }

  lists = mergeLists(lists);

  function buildTree(containers) {
    var root = { children: [], selector: "", depth: -1 };
    var stack = [root];

    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      var node = { selector: c.selector, size: c.size, region: c.region, depth: c.depth, children: [] };

      while (stack.length > 1 && stack[stack.length - 1].depth >= c.depth) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }

    return root.children;
  }

  var tree = buildTree(containers);

  function toYaml(nodes, indent) {
    if (!nodes || nodes.length === 0) return "";
    var spaces = "  ".repeat(indent);
    var result = "";

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var selector = node.selector || (node.region || "div");
      var parts = [];
      if (node.region) parts.push(node.region);
      parts.push(formatSize(node.size));

      result += spaces + selector + ": [" + parts.join(" ") + "]\\n";
      result += toYaml(node.children, indent + 1);
    }

    return result;
  }

  var yaml = toYaml(tree, 0);

  if (lists.length > 0) {
    yaml += "\\n# 列表/数组\\n";
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      var countStr = typeof list.count === "number" ? "×" + list.count : list.count;
      yaml += list.selector + ": [" + list.type + " " + countStr + " " + formatSize(list.size) + "]\\n";
      if (list.item) {
        yaml += "  " + list.item.selector + ": [item " + formatSize(list.item.size) + "]\\n";
      }
    }
  }

  return { layout: { containers: containers, lists: lists }, yaml: yaml };
})`;

export function getStructureExtractorForTest(): string {
  return STRUCTURE_EXTRACTOR_CODE;
}
