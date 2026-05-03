export const STRUCTURE_SELECTOR_CODE = `
  var excludeTags = new Set([
    "SCRIPT","STYLE","NOSCRIPT","META","LINK","HEAD","HTML","TITLE",
    "SVG","PATH","G","DEFS","USE","CIRCLE","RECT","POLYGON","LINE","POLYLINE"
  ]);

  var genericClasses = new Set([
    "list-none", "flex", "grid", "block", "inline", "hidden", "container",
    "wrapper", "content", "item", "card", "row", "col", "section", "main",
    "header", "footer", "nav", "sidebar", "menu", "list", "grid", "grid-cols-1",
    "grid-cols-2", "grid-cols-3", "grid-cols-4", "flex-row", "flex-col",
    "items-center", "justify-center", "justify-between", "gap-1", "gap-2",
    "gap-3", "gap-4", "p-1", "p-2", "p-3", "p-4", "m-1", "m-2", "m-3", "m-4",
    "text-sm", "text-base", "text-lg", "text-xl", "font-bold", "font-medium",
    "rounded", "rounded-lg", "shadow", "shadow-lg", "border", "border-gray",
    "bg-white", "bg-gray", "text-gray", "text-black", "text-white"
  ]);

  function getSelector(el, includeParent) {
    var id = el.id;
    if (id && id.indexOf(":") !== 0 && id.length >= 3 && id.length < 25) {
      var isHashId = /^(t3_|uid_)/.test(id) ||
                     /[-_](t3_|uid_)/.test(id) ||
                     /^[a-z]?[0-9a-f]{4,}$/i.test(id) ||
                     /^_[a-zA-Z0-9_]{5,}$/.test(id) ||
                     /^_[A-Z]/.test(id) ||
                     /^[A-Z][a-z]{1,5}[A-Z][a-z]*/.test(id) ||
                     /^[a-z]{2,6}[0-9]{2,}$/i.test(id) ||
                     /^[a-zA-Z0-9]{6,}$/.test(id) && !/[aeiou]{2,}/i.test(id) ||
                     /^[A-Z][a-zA-Z0-9]{4,}$/.test(id) && !/[aeiou]{2,}/i.test(id) ||
                     /^[a-z]{3,5}$/.test(id) && !/(nav|btn|app|main|form|list|item|card|grid|feed|menu|user|logo|home|search|login|signup|header|footer|sidebar|content|container)/i.test(id) ||
                     /[A-Z]/.test(id) && /[a-z]/.test(id) && id.length <= 5 ||
                     /^[A-Z][a-z]{1,3}[A-Z]/.test(id) && id.length <= 5 ||
                     /^rc-tabs-/.test(id) ||
                     /^ytp-id-/.test(id) ||
                     /^feed-item-/.test(id) ||
                     /^batBeacon/.test(id) ||
                     /^disinterest-event-id-/.test(id) ||
                     /^portal\\//.test(id) ||
                     /^_r_[a-z0-9_]+_$/.test(id) ||
                     /_svg_/.test(id) ||
                     /^desktop(-[a-z]+)?-(grid|btf|item|col|row)?-[0-9]+$/i.test(id);
      if (!isHashId) {
        return "#" + id;
      }
    }
    var testId = el.getAttribute("data-testid");
    if (testId && testId.length < 30) {
      return '[data-testid="' + testId + '"]';
    }
    var e2e = el.getAttribute("data-e2e");
    if (e2e && e2e.length > 0 && e2e.length < 30) {
      return '[data-e2e="' + e2e + '"]';
    }
    
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.length > 2 && ariaLabel.length < 30) {
      var semanticPatterns = /导航|菜单|搜索|登录|注册|关闭|打开|展开|收起|播放|暂停|上一张|下一张|主要内容|侧边栏|页眉|页脚|分享|评论|点赞|收藏|navigation|menu|search|login|register|close|open|expand|collapse|play|pause|prev|next|main|sidebar|header|footer|share|comment|like|bookmark/i;
      if (semanticPatterns.test(ariaLabel)) {
        return "[aria-label=\\\"" + ariaLabel + "\\\"]";
      }
    }
    
    var role = el.getAttribute("role");
    if (role && role.length > 2 && role !== "presentation" && role !== "none") {
      return "[role=" + role + "]";
    }
    
    var classAttr = el.getAttribute("class") || "";
    var classes = classAttr.trim().split(/\\s+/)
      .map(function(c) {
        var cssModuleMatchHash = c.match(/^(.+)_([^_]{4,})$/);
        if (cssModuleMatchHash && cssModuleMatchHash[1].length >= 3) {
          return '[class^="' + cssModuleMatchHash[1] + '_"]';
        }
        return c;
      })
      .filter(function(c) {
        return c &&
          c.indexOf("_") !== 0 &&
          c.indexOf("css-") !== 0 &&
          c.indexOf("prc-") !== 0 &&
          c.indexOf("sc-") !== 0 &&
          c.indexOf("r-") !== 0 &&
          c.indexOf("__cdp") === -1 &&
          c.indexOf("[") === -1 &&
          c.indexOf(":") === -1 &&
          !/^[a-z]?[0-9a-f]{4,}$/i.test(c) &&
          !/^[a-z]+[0-9]+[a-z]*[0-9]*$/i.test(c) &&
          !/^css(-[a-z0-9]+)?$/i.test(c) &&
          !/^jsx-[0-9]+$/.test(c) &&
          !/^a-/.test(c.toLowerCase()) &&
          !/^version[0-9]*/i.test(c) &&
          !/^style-scope/.test(c) &&
          !/^woo-box-/.test(c) &&
          !/--[a-zA-Z0-9]{5,}$/.test(c) &&
          !/^_[a-zA-Z0-9]{5,}$/.test(c) &&
          !/^(hidden|block|flex|grid|absolute|relative|fixed|sticky|inline|visible|invisible|sr-only|not-sr-only|d-flex|d-block|d-none|d-inline|d-inline-flex|d-md-flex|d-lg-flex|flex-1|flex-auto|flex-column|flex-row|flex-wrap|flex-col|flex-col-reverse|antialiased|subpixel-|normal-case|uppercase|lowercase|capitalize|truncate)$/i.test(c) &&
          !/^(w-|h-|p-|m-|lg|xl|md|sm|xs|pt|pb|pl|pr|px|py|mt|mb|ml|mr|mx|my|font|cursor|white|black|bg|border|rounded|shadow|overflow|z-|opacity|transition|transform|duration|ease|animate|align|justify|items|self|gap|space|order|float|clear|display|min-h-|max-h-|min-w-|max-w-|position-|width-|height-|color-|tmp-|hide-|inset-|shrink-|grow-|object-|pointer-events-|mix-blend-|translate-|scale-|rotate-|skew-|origin-|@container|from-|to-|via-|blur-|brightness-|contrast-|saturate-|grayscale-|sepia-|backdrop-|select-|resize-|outline-|ring-|decoration-|underline-|break-|whitespace-|indent-|leading-|tracking-|divide-|place-|contents-|aspect-|columns-|container-|isolate-|snap-|scroll-|overscroll-|touch-|will-change-|fill-|stroke|left-|right-|top-|bottom-|text-|-translate-|-scale-|-rotate-|-skew-)/i.test(c) &&
          c.length > 3 &&
          c.length < 25 &&
          /[a-z]{3,}/i.test(c) &&
          !/^[a-z]{2,6}[0-9]{2,}$/i.test(c) &&
          !/^[A-Z][a-z]{1,5}[A-Z][a-z]*$/.test(c) &&
          (!/^[a-zA-Z0-9]{5,}$/.test(c) || /[aeiou]{2,}/i.test(c)) &&
          !(/[A-Z]/.test(c.charAt(0)) && /[a-z]/.test(c.slice(1)) && c.length <= 5) &&
          !genericClasses.has(c);
      });
    
    if (classes.length > 0) return "." + classes[0];
    
    var tag = el.tagName.toLowerCase();
    var semanticTags = ["header", "nav", "main", "section", "article", "aside", "footer", "form", "dialog"];
    if (semanticTags.indexOf(tag) !== -1) {
      return tag;
    }
    
    return "";
  }

  function getUniqueSelector(el, maxDepth) {
    if (!maxDepth) maxDepth = 5;
    
    var baseSelector = getSelector(el);
    if (!baseSelector) return "";
    
    try {
      var matches = document.querySelectorAll(baseSelector);
      if (matches.length === 1) {
        return baseSelector;
      }
      if (matches.length > 1 && maxDepth > 0 && el.parentElement && el.parentElement !== document.body) {
        var parentSelector = getUniqueSelector(el.parentElement, maxDepth - 1);
        if (parentSelector) {
          var combinedSelector = parentSelector + " > " + baseSelector;
          try {
            var combinedMatches = document.querySelectorAll(combinedSelector);
            if (combinedMatches.length === 1) {
              return combinedSelector;
            }
          } catch (e) {}
        }
      }
      return "";
    } catch (e) {
      return "";
    }
  }
`;
