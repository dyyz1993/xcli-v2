export const LAYOUT_HELPER_CODE = `
  var excludeTags = new Set([
    "SCRIPT","STYLE","NOSCRIPT","META","LINK","HEAD","HTML","TITLE",
    "SVG","PATH","G","DEFS","USE","CIRCLE","RECT","POLYGON","LINE","POLYLINE"
  ]);
  var semanticTags = new Set([
    "HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE","FORM",
    "UL","OL","DL","MENU","TABLE","FIGURE","FIGCAPTION","DETAILS","SUMMARY","DIALOG"
  ]);
  var layoutTags = new Set([
    "DIV","HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE","FORM",
    "UL","OL","DL","MENU","TABLE"
  ]);
  var IMPORTANT_KEYWORDS = [
    "content","container","main","sidebar","header","footer","nav","search",
    "form","list","card","feed","item","post","article","comment","user",
    "profile","recommend","suggest","category","tag","tab","modal","dialog",
    "dropdown","menu","button","input","login","register","cart","checkout",
    "product","price","image","video","audio","player","map","calendar",
    "table","chart","graph","filter","sort","pagination","breadcrumb"
  ];

  function getSelector(el) {
    var semanticTags = new Set([
      "ARTICLE","SECTION","NAV","MAIN","ASIDE","HEADER","FOOTER","FORM",
      "FIGURE","FIGCAPTION","DIALOG","DETAILS","SUMMARY","ADDRESS",
      "H1","H2","H3","H4","H5","H6"
    ]);
    
    if (el.getAttribute && el.getAttribute('data-testid')) {
      return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    }
    
    if (el.getAttribute && el.getAttribute('data-id')) {
      return '[data-id="' + el.getAttribute('data-id') + '"]';
    }
    
    if (semanticTags.has(el.tagName)) {
      return el.tagName.toLowerCase();
    }
    
    if (el.id) return "#" + el.id;
    
    var classes = (el.className || "").toString().trim().split(/[\\s]+/)
      .filter(function(c) { 
        return c && 
          c.indexOf("reds-") !== 0 && 
          c.indexOf("css-") !== 0 && 
          c.indexOf("prc-") !== 0 &&
          c.indexOf("__") === -1 &&
          c.indexOf("_") !== 0 &&
          !c.match(/^[a-z][a-z0-9]*-[a-z0-9]+-[a-z0-9]+$/) &&
          c.length > 2 && 
          c.length < 30; 
      });
    
    var importantKeywords = ["btn", "button", "input", "card", "item", "menu", "nav", "header", "footer", "sidebar", "modal", "dialog", "form", "search", "chat", "message", "copy"];
    for (var i = 0; i < classes.length; i++) {
      var cls = classes[i].toLowerCase();
      for (var j = 0; j < importantKeywords.length; j++) {
        if (cls.indexOf(importantKeywords[j]) !== -1) {
          return "." + classes[i];
        }
      }
    }
    
    if (classes.length > 0) return "." + classes[0];
    
    var path = [];
    var current = el;
    var maxDepth = 5;
    var depth = 0;
    while (current && depth < maxDepth) {
      var tag = current.tagName ? current.tagName.toLowerCase() : '';
      if (!tag || tag === 'html' || tag === 'body') break;
      
      var selector = tag;
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }
      
      var cls = (current.className || "").toString().trim().split(/[\\s]+/)[0];
      if (cls) selector += '.' + cls;
      
      var parent = current.parentElement;
      if (parent) {
        var children = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (children.length > 1) {
          var index = children.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      
      path.unshift(selector);
      current = parent;
      depth++;
    }
    
    return path.join(' > ');
  }

  function extractKeywords(el) {
    var keywords = [];
    var className = (el.className || "").toString().toLowerCase();
    var id = (el.id || "").toLowerCase();
    var allText = className + " " + id;
    
    for (var i = 0; i < IMPORTANT_KEYWORDS.length; i++) {
      var keyword = IMPORTANT_KEYWORDS[i];
      var patterns = ["-" + keyword + "-", "-" + keyword, keyword + "-", "_" + keyword, keyword + "_"];
      for (var j = 0; j < patterns.length; j++) {
        if (allText.indexOf(patterns[j]) !== -1) {
          keywords.push(keyword);
          break;
        }
      }
    }
    return keywords;
  }

  function getRegionType(el) {
    var tag = el.tagName;
    var role = el.getAttribute("role");
    var className = (el.className || "").toString().toLowerCase();
    var id = (el.id || "").toLowerCase();
    if (role === "navigation" || tag === "NAV" || className.indexOf("nav") !== -1 || id.indexOf("nav") !== -1) return "nav";
    if (role === "banner" || tag === "HEADER") return "header";
    if (role === "contentinfo" || tag === "FOOTER") return "footer";
    if (role === "main" || tag === "MAIN") return "main";
    if (role === "complementary" || tag === "ASIDE" || className.indexOf("sidebar") !== -1 || id.indexOf("sidebar") !== -1) return "sidebar";
    if (tag === "FORM" || className.indexOf("form") !== -1 || id.indexOf("form") !== -1) return "form";
    if (className.indexOf("search") !== -1 || id.indexOf("search") !== -1) return "search";
    if (tag === "SECTION" || tag === "ARTICLE") return "section";
    if (["UL","OL","DL","MENU"].indexOf(tag) !== -1 || role === "list") return "list";
    if (tag === "TABLE") return "table";
    if (className.indexOf("modal") !== -1 || id.indexOf("modal") !== -1 || role === "dialog") return "modal";
    if (className.indexOf("card") !== -1 || id.indexOf("card") !== -1) return "card";
    if (className.indexOf("feed") !== -1 || id.indexOf("feed") !== -1) return "feed";
    if (className.indexOf("dropdown") !== -1 || id.indexOf("dropdown") !== -1) return "dropdown";
    if (className.indexOf("tab") !== -1 || id.indexOf("tab") !== -1) return "tab";
    return undefined;
  }

  function isSearchInput(el) {
    if (el.tagName !== "INPUT") return false;
    var type = el.getAttribute("type") || "text";
    if (type === "hidden" || type === "submit" || type === "button") return false;
    var placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    var name = (el.getAttribute("name") || "").toLowerCase();
    var id = (el.id || "").toLowerCase();
    var className = (el.className || "").toString().toLowerCase();
    return placeholder.indexOf("search") !== -1 || placeholder.indexOf("搜索") !== -1 || placeholder.indexOf("搜") !== -1 ||
           name.indexOf("search") !== -1 || name.indexOf("kw") !== -1 || name.indexOf("q") !== -1 ||
           id.indexOf("search") !== -1 || id.indexOf("kw") !== -1 || className.indexOf("search") !== -1;
  }

  function countInteractive(el) {
    var inputs = el.querySelectorAll("input:not([type=\\\\\\"hidden\\\\\\"]):not([type=\\\\\\"submit\\\\\\"]):not([type=\\\\\\"button\\\\\\"])");
    var buttons = el.querySelectorAll("button, input[type=\\\\\\"submit\\\\\\"], input[type=\\\\\\"button\\\\\\"]");
    var links = el.querySelectorAll("a[href]");
    return { inputs: inputs.length, buttons: buttons.length, links: links.length };
  }

  function isHidden(el) {
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return true;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
    return false;
  }

  function isActive(el) {
    var className = (el.className || "").toString().toLowerCase();
    var id = (el.id || "").toLowerCase();
    return className.indexOf("active") !== -1 || className.indexOf("selected") !== -1 || 
           className.indexOf("current") !== -1 || id.indexOf("active") !== -1;
  }

  function isSameLayout(a, b) {
    if (a.tagName !== b.tagName) return false;
    if (a.tagName === "ARTICLE") return true;
    var aRegion = getRegionType(a);
    var bRegion = getRegionType(b);
    if (aRegion !== bRegion) return false;
    var aClass = (a.className || "").toString().split(" ")[0];
    var bClass = (b.className || "").toString().split(" ")[0];
    if (aClass !== bClass) return false;
    var aChildren = Array.from(a.children).filter(function(c) { return layoutTags.has(c.tagName); });
    var bChildren = Array.from(b.children).filter(function(c) { return layoutTags.has(c.tagName); });
    if (aChildren.length !== bChildren.length) return false;
    return true;
  }

  function groupChildren(children) {
    var groups = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (groups.length > 0) {
        var last = groups[groups.length - 1];
        if (isSameLayout(last.element, child)) {
          last.count++;
          continue;
        }
      }
      groups.push({ element: child, count: 1 });
    }
    return groups;
  }

  function shouldInclude(el) {
    var tag = el.tagName;
    if (excludeTags.has(tag)) return false;
    if (semanticTags.has(tag)) return true;
    if (layoutTags.has(tag)) return true;
    var region = getRegionType(el);
    if (region) return true;
    var counts = countInteractive(el);
    if (counts.inputs > 0 || counts.buttons > 0) return true;
    var className = (el.className || "").toString().toLowerCase();
    if (className.indexOf("container") !== -1 || className.indexOf("wrapper") !== -1 ||
        className.indexOf("content") !== -1 || className.indexOf("layout") !== -1 ||
        className.indexOf("main") !== -1 || className.indexOf("sidebar") !== -1 ||
        className.indexOf("header") !== -1 || className.indexOf("footer") !== -1) {
      return true;
    }
    return false;
  }

  function hasSignificantContent(el) {
    var tag = el.tagName;
    if (semanticTags.has(tag)) return true;
    var region = getRegionType(el);
    if (region) return true;
    var counts = countInteractive(el);
    if (counts.inputs > 0 || counts.buttons > 0 || counts.links > 5) return true;
    var directChildren = Array.from(el.children).filter(shouldInclude);
    if (directChildren.length > 1) return true;
    return false;
  }
`;
