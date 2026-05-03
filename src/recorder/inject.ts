export function getRecorderScript(): string {
  return `
(function() {
  if (window.__pageRecorder) {
    console.log('[PageRecorder] Already exists, skipping initialization');
    return;
  }

  console.log('[PageRecorder] Initializing...');

  class PageRecorder {
    constructor() {
      this.recordingId = '';
      this.startTime = 0;
      this.isRecording = false;
      this.eventId = 0;
      this.indicator = null;
      this.eventCountEl = null;

      this.MOUSE_THROTTLE = 50;
      this.SCROLL_THROTTLE = 100;

      this.lastMouseMove = 0;
      this.lastScroll = 0;
      this.networkRequests = 0;
      this.pendingWaits = [];

      this._listenersBound = false;

      this.classChangePatterns = {
        prefixes: ['active-', 'show-', 'open-', 'disabled-', 'selected-', 'hide-'],
        suffixes: ['-active', '-visible', '-open', '-selected', '-hidden'],
        exacts: ['active', 'selected', 'disabled', 'open', 'visible', 'hidden']
      };

      this.watchedAttributes = ['aria-expanded', 'aria-selected', 'disabled', 'checked', 'aria-hidden'];

      this._elementVisibilityCache = new WeakMap();
      this._mutationObserver = null;
      this._lastTouchStart = null;

      console.log('[PageRecorder] Constructor called');
    }

    // Bind event listeners - must be called when document is ready
    bindEventListeners() {
      if (this._listenersBound) return;

      this._handleClick = this.handleClick.bind(this);
      this._handleDblClick = this.handleDblClick.bind(this);
      this._handleContextMenu = this.handleContextMenu.bind(this);
      this._handleMouseDown = this.handleMouseDown.bind(this);
      this._handleMouseUp = this.handleMouseUp.bind(this);
      this._handleMouseMove = this.handleMouseMove.bind(this);
      this._handleMouseEnter = this.handleMouseEnter.bind(this);
      this._handleMouseLeave = this.handleMouseLeave.bind(this);
      this._handleScroll = this.handleScroll.bind(this);
      this._handleKeyDown = this.handleKeyDown.bind(this);
      this._handleKeyUp = this.handleKeyUp.bind(this);
      this._handleInput = this.handleInput.bind(this);
      this._handleChange = this.handleChange.bind(this);
      this._handleFocus = this.handleFocus.bind(this);
      this._handleBlur = this.handleBlur.bind(this);
      this._handleHashChange = this.handleHashChange.bind(this);
      this._handlePopState = this.handlePopState.bind(this);
      this._handlePageShow = this.handlePageShow.bind(this);
      this._handleSubmit = this.handleSubmit.bind(this);
      this._handleReset = this.handleReset.bind(this);
      this._handleResize = this.handleResize.bind(this);
      this._handleTouchStart = this.handleTouchStart.bind(this);
      this._handleTouchEnd = this.handleTouchEnd.bind(this);
      this._handleTouchMove = this.handleTouchMove.bind(this);

      document.addEventListener('click', this._handleClick, true);
      document.addEventListener('dblclick', this._handleDblClick, true);
      document.addEventListener('contextmenu', this._handleContextMenu, true);
      document.addEventListener('mousedown', this._handleMouseDown, true);
      document.addEventListener('mouseup', this._handleMouseUp, true);
      document.addEventListener('mousemove', this._handleMouseMove, true);
      document.addEventListener('mouseenter', this._handleMouseEnter, true);
      document.addEventListener('mouseleave', this._handleMouseLeave, true);
      document.addEventListener('scroll', this._handleScroll, true);
      document.addEventListener('keydown', this._handleKeyDown, true);
      document.addEventListener('keyup', this._handleKeyUp, true);
      document.addEventListener('input', this._handleInput, true);
      document.addEventListener('change', this._handleChange, true);
      document.addEventListener('focus', this._handleFocus, true);
      document.addEventListener('blur', this._handleBlur, true);
      document.addEventListener('submit', this._handleSubmit, true);
      document.addEventListener('reset', this._handleReset, true);
      window.addEventListener('hashchange', this._handleHashChange, true);
      window.addEventListener('popstate', this._handlePopState, true);
      window.addEventListener('pageshow', this._handlePageShow, true);
      window.addEventListener('resize', this._handleResize, true);
      document.addEventListener('touchstart', this._handleTouchStart, true);
      document.addEventListener('touchend', this._handleTouchEnd, true);
      document.addEventListener('touchmove', this._handleTouchMove, true);

      this.observeMutations();
      this.setupMediaListeners();
      this.setupDropdownListeners();

      this._listenersBound = true;
      this.monitorNetwork();
      this.interceptHistory();
    }

    start(recordingId) {
      // If already recording with the same ID, just ensure indicator is shown
      if (this.isRecording && this.recordingId === recordingId) {
        this.showIndicator();
        return;
      }

      this.recordingId = recordingId;
      this.startTime = Date.now();
      this.isRecording = true;
      this.eventId = 0;

      // Bind listeners when starting (document should be ready now)
      this.bindEventListeners();
      this.showIndicator();
    }

    stop() {
      this.isRecording = false;
      this.hideIndicator();
    }

    hideIndicator() {
      if (this.indicator) {
        this.indicator.remove();
        this.indicator = null;
      }
    }

    showIndicator() {
      // Check if indicator already exists in DOM
      var existingIndicator = document.getElementById('__mpage_recorder_indicator__');
      if (existingIndicator) {
        this.indicator = existingIndicator;
        return;
      }

      // Wait for body if needed
      if (!document.body) {
        var self = this;
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() { self.showIndicator(); });
        } else {
          setTimeout(function() { self.showIndicator(); }, 50);
        }
        return;
      }

      // Create indicator
      this.indicator = document.createElement('div');
      this.indicator.id = '__mpage_recorder_indicator__';
      this.indicator.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#e74c3c;color:white;padding:8px 16px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      this.indicator.innerHTML = '🎬 录制中... <span id="__mpage_event_count__">' + this.eventId + '</span> 事件';
      document.body.appendChild(this.indicator);
    }

    updateIndicator() {
      // Always get fresh reference from DOM
      var countEl = document.getElementById('__mpage_event_count__');
      if (countEl) {
        countEl.textContent = this.eventId;
      } else if (this.isRecording) {
        // Indicator was removed, recreate it
        this.showIndicator();
      }
    }

    send(event) {
      // Use fetch to POST event to the route handler
      // This is more reliable than exposeFunction for cross-world communication
      fetch('/__mpage_record_event__', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).catch(function(err) {
        console.log('[PageRecorder] Error sending event:', err.message);
      });
    }

    record(event) {
      console.log('[PageRecorder] record() called, isRecording:', this.isRecording);
      if (!this.isRecording) {
        console.log('[PageRecorder] Not recording, skipping');
        return;
      }

      var fullEvent = {
        id: 'evt_' + String(++this.eventId).padStart(3, '0'),
        timestamp: Date.now() - this.startTime,
        type: event.type,
        selector: event.selector,
        tagName: event.tagName,
        data: event.data || {},
        waitBefore: event.waitBefore,
        recordingId: this.recordingId,
        pageState: {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState
        }
      };

      console.log('[PageRecorder] Recording event:', fullEvent.type, fullEvent.id);
      this.send(fullEvent);
      this.updateIndicator();
    }

    getSelector(element) {
      if (!element || typeof element.getAttribute !== 'function') {
        return '';
      }
      if (element === document.body || element === document.documentElement) {
        return 'body';
      }

      if (element.id) {
        return '#' + CSS.escape(element.id);
      }

      var testId = element.getAttribute('data-testid');
      if (testId) {
        return '[data-testid="' + testId + '"]';
      }

      var dataCy = element.getAttribute('data-cy');
      if (dataCy) {
        return '[data-cy="' + dataCy + '"]';
      }

      var ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return element.tagName.toLowerCase() + '[aria-label="' + ariaLabel + '"]';
      }

      var path = [];
      var current = element;

      while (current && current !== document.body) {
        var selector = current.tagName.toLowerCase();

        var classes = Array.from(current.classList).filter(function(c) {
          return !this.isGeneratedClass(c);
        }.bind(this)).slice(0, 2);

        if (classes.length > 0) {
          selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
        }

        var parent = current.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children);
          var index = siblings.indexOf(current) + 1;
          if (siblings.length > 1) {
            selector += ':nth-child(' + index + ')';
          }
        }

        path.unshift(selector);
        current = current.parentElement;
      }

      return path.join(' > ');
    }

    isGeneratedClass(className) {
      return /^[a-z]?[0-9a-f]{6,}$/i.test(className) ||
             /^css-[a-z0-9]+$/i.test(className) ||
             /^_[a-f0-9]+$/i.test(className) ||
             /^sc-[a-z]+$/i.test(className) ||
             /^css-[0-9]+$/i.test(className);
    }

    captureWaitConditions() {
      var conditions = [];

      var loadingElements = document.querySelectorAll(
        '[class*="loading"], [class*="spinner"], [data-loading="true"], [aria-busy="true"]'
      );

      for (var i = 0; i < loadingElements.length; i++) {
        conditions.push({
          type: 'element_hidden',
          selector: this.getSelector(loadingElements[i])
        });
      }

      if (this.networkRequests > 0) {
        conditions.push({ type: 'network_idle' });
      }

      return conditions.length > 0 ? conditions : undefined;
    }

    handleClick(e) {
      console.log('[PageRecorder] handleClick triggered!', e.target);
      this.record({
        type: 'click',
        selector: this.getSelector(e.target),
        tagName: e.target.tagName ? e.target.tagName.toLowerCase() : '',
        data: { x: e.clientX, y: e.clientY, button: e.button },
        waitBefore: this.captureWaitConditions()
      });
    }

    handleDblClick(e) {
      this.record({
        type: 'dblclick',
        selector: this.getSelector(e.target),
        tagName: e.target.tagName ? e.target.tagName.toLowerCase() : '',
        data: { x: e.clientX, y: e.clientY }
      });
    }

    handleContextMenu(e) {
      this.record({
        type: 'contextmenu',
        selector: this.getSelector(e.target),
        tagName: e.target.tagName ? e.target.tagName.toLowerCase() : '',
        data: { x: e.clientX, y: e.clientY }
      });
    }

    handleMouseDown(e) {
      this.record({
        type: 'mousedown',
        selector: this.getSelector(e.target),
        data: { x: e.clientX, y: e.clientY, button: e.button }
      });
    }

    handleMouseUp(e) {
      this.record({
        type: 'mouseup',
        selector: this.getSelector(e.target),
        data: { x: e.clientX, y: e.clientY, button: e.button }
      });
    }

    handleMouseMove(e) {
      var now = Date.now();
      if (now - this.lastMouseMove < this.MOUSE_THROTTLE) return;
      this.lastMouseMove = now;

      this.record({
        type: 'mousemove',
        data: { x: e.clientX, y: e.clientY }
      });
    }

    handleMouseEnter(e) {
      if (e.target.nodeType !== 1) return;
      if (e.target === document.body || e.target === document.documentElement) return;

      this.record({
        type: 'hover_enter',
        selector: this.getSelector(e.target),
        tagName: e.target.tagName ? e.target.tagName.toLowerCase() : '',
        data: {}
      });
    }

    handleMouseLeave(e) {
      if (e.target.nodeType !== 1) return;
      if (e.target === document.body || e.target === document.documentElement) return;

      this.record({
        type: 'hover_leave',
        selector: this.getSelector(e.target),
        data: {}
      });
    }

    handleScroll(e) {
      var now = Date.now();
      if (now - this.lastScroll < this.SCROLL_THROTTLE) return;
      this.lastScroll = now;

      this.record({
        type: 'scroll',
        data: { scrollX: window.scrollX, scrollY: window.scrollY }
      });
    }

    handleKeyDown(e) {
      this.record({
        type: 'keydown',
        selector: this.getSelector(e.target),
        data: {
          key: e.key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey
        }
      });
    }

    handleKeyUp(e) {
      this.record({
        type: 'keyup',
        selector: this.getSelector(e.target),
        data: {
          key: e.key,
          code: e.code
        }
      });
    }

    handleInput(e) {
      if (e.target.nodeType !== 1) return;
      var target = e.target;
      var value = target.value !== undefined ? target.value : '';

      this.record({
        type: 'input',
        selector: this.getSelector(target),
        tagName: target.tagName ? target.tagName.toLowerCase() : '',
        data: { value: value }
      });
    }

    handleChange(e) {
      if (e.target.nodeType !== 1) return;
      var target = e.target;
      var value = target.value !== undefined ? target.value : '';
      var checked = target.checked !== undefined ? target.checked : undefined;

      this.record({
        type: 'change',
        selector: this.getSelector(target),
        tagName: target.tagName ? target.tagName.toLowerCase() : '',
        data: { value: value, checked: checked }
      });
    }

    handleFocus(e) {
      if (e.target.nodeType !== 1) return;
      this.record({
        type: 'focus',
        selector: this.getSelector(e.target),
        tagName: e.target.tagName ? e.target.tagName.toLowerCase() : '',
        data: {}
      });
    }

    handleBlur(e) {
      if (e.target.nodeType !== 1) return;
      this.record({
        type: 'blur',
        selector: this.getSelector(e.target),
        data: {}
      });
    }

    handleHashChange(e) {
      this.record({
        type: 'hash_change',
        data: {
          url: window.location.href,
          oldURL: e.oldURL,
          newURL: e.newURL,
          hash: window.location.hash
        }
      });
    }

    handlePopState(e) {
      this.record({
        type: 'navigation',
        data: {
          url: window.location.href,
          navigationType: 'history',
          state: e.state ? JSON.stringify(e.state) : undefined
        }
      });
    }

    handlePageShow(e) {
      this.record({
        type: 'page_load',
        data: {
          url: window.location.href,
          persisted: e.persisted
        }
      });
    }

    handleSubmit(e) {
      const form = e.target;
      this.record({
        type: 'submit',
        selector: this.getSelector(form),
        data: {
          formSelector: this.getSelector(form),
          method: form.method || undefined,
          action: form.action || undefined
        }
      });
    }

    handleReset(e) {
      const form = e.target;
      this.record({
        type: 'form_reset',
        selector: this.getSelector(form),
        data: {
          formSelector: this.getSelector(form)
        }
      });
    }

    handleResize(e) {
      this.record({
        type: 'window_resize',
        data: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
    }

    handleTouchStart(e) {
      if (e.touches.length === 1) {
        this._lastTouchStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
      }
      this.record({
        type: 'touchstart',
        data: {
          touches: Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
        }
      });
    }

    handleTouchEnd(e) {
      if (this._lastTouchStart && e.changedTouches.length === 1) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - this._lastTouchStart.x;
        const dy = endY - this._lastTouchStart.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const minSwipeDistance = 50;

        if (Math.max(absDx, absDy) > minSwipeDistance) {
          if (absDx > absDy) {
            this.record({
              type: dx > 0 ? 'swipe_right' : 'swipe_left',
              data: {
                touches: [{ x: endX, y: endY }],
                direction: dx > 0 ? 'right' : 'left'
              }
            });
          } else {
            this.record({
              type: dy > 0 ? 'swipe_down' : 'swipe_up',
              data: {
                touches: [{ x: endX, y: endY }],
                direction: dy > 0 ? 'down' : 'up'
              }
            });
          }
        }
      }
      this._lastTouchStart = null;
      this.record({
        type: 'touchend',
        data: {
          touches: Array.from(e.changedTouches).map(t => ({ x: t.clientX, y: t.clientY }))
        }
      });
    }

    handleTouchMove(e) {
      this.record({
        type: 'touchmove',
        data: {
          touches: Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
        }
      });
    }

    matchesClassPattern(className) {
      const { prefixes, suffixes, exacts } = this.classChangePatterns;
      return (
        exacts.indexOf(className) !== -1 ||
        prefixes.some(function(p) { return className.indexOf(p) === 0; }) ||
        suffixes.some(function(s) { return className.indexOf(s) === className.length - s.length; })
      );
    }

    handleClassAttributeChange(mutation) {
      const target = mutation.target;
      const oldClasses = mutation.oldValue ? mutation.oldValue.split(/\s+/) : [];
      const newClasses = target.className ? target.className.split(/\s+/) : [];

      const addedClasses = newClasses.filter(function(c) { return oldClasses.indexOf(c) === -1 && c; });
      const removedClasses = oldClasses.filter(function(c) { return newClasses.indexOf(c) === -1 && c; });

      const matchedAdded = addedClasses.filter(this.matchesClassPattern.bind(this));
      const matchedRemoved = removedClasses.filter(this.matchesClassPattern.bind(this));

      if (matchedAdded.length > 0 || matchedRemoved.length > 0) {
        this.record({
          type: 'class_change',
          selector: this.getSelector(target),
          data: {
            addedClasses: addedClasses,
            removedClasses: removedClasses,
            matchedClasses: matchedAdded.concat(matchedRemoved)
          }
        });
      }

      this.checkElementVisibility(target);
    }

    checkElementVisibility(element) {
      if (!element || element === document.documentElement || element === document.body) return;

      const isVisible = this.isElementVisible(element);
      const cached = this._elementVisibilityCache.get(element);

      if (cached !== isVisible) {
        this._elementVisibilityCache.set(element, isVisible);
        this.record({
          type: isVisible ? 'element_show' : 'element_hide',
          selector: this.getSelector(element),
          data: {
            visibility: isVisible ? 'visible' : 'hidden',
            display: isVisible ? '' : 'none'
          }
        });

        if (this.isPopupElement(element)) {
          this.record({
            type: isVisible ? 'popup_show' : 'popup_hide',
            selector: this.getSelector(element),
            data: {
              popupType: this.detectPopupType(element)
            }
          });
        }
      }
    }

    isElementVisible(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    isPopupElement(element) {
      if (!element) return false;
      const role = element.getAttribute('role');
      if (role === 'dialog' || role === 'modal' || role === 'alertdialog') return true;
      if (element.tagName === 'DIALOG') return true;
      const className = element.className || '';
      if (typeof className === 'string') {
        return /popup|modal|drawer|tooltip/i.test(className);
      }
      return false;
    }

    detectPopupType(element) {
      const role = element.getAttribute('role');
      if (role === 'dialog' || role === 'alertdialog') return 'modal';
      const className = element.className || '';
      if (typeof className === 'string') {
        if (/drawer/i.test(className)) return 'drawer';
        if (/tooltip/i.test(className)) return 'tooltip';
        if (/popup/i.test(className)) return 'popup';
        if (/modal/i.test(className)) return 'modal';
      }
      if (element.tagName === 'DIALOG') return 'modal';
      return 'popup';
    }

    observeMutations() {
      var self = this;
      this._mutationObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var mutation = mutations[i];
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            self.handleClassAttributeChange(mutation);
          } else if (mutation.type === 'attributes' && mutation.attributeName) {
            if (self.watchedAttributes.indexOf(mutation.attributeName) !== -1) {
              self.handleAttributeChange(mutation);
            }
          } else if (mutation.type === 'childList') {
            for (var j = 0; j < mutation.addedNodes.length; j++) {
              var node = mutation.addedNodes[j];
              if (node.nodeType === Node.ELEMENT_NODE) {
                self.record({
                  type: 'dom_node_added',
                  selector: self.getSelector(node.parentElement),
                  data: {
                    parentSelector: self.getSelector(node.parentElement),
                    nodeName: node.nodeName
                  }
                });
                self.checkElementVisibility(node);
              }
            }
            for (var k = 0; k < mutation.removedNodes.length; k++) {
              var removedNode = mutation.removedNodes[k];
              if (removedNode.nodeType === Node.ELEMENT_NODE) {
                self.record({
                  type: 'dom_node_removed',
                  selector: self.getSelector(removedNode.parentElement),
                  data: {
                    parentSelector: self.getSelector(removedNode.parentElement),
                    nodeName: removedNode.nodeName
                  }
                });
              }
            }
          }
        }
      });

      this._mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class'].concat(this.watchedAttributes),
        childList: true,
        subtree: true
      });
    }

    handleAttributeChange(mutation) {
      const target = mutation.target;
      const attrName = mutation.attributeName;
      const oldValue = mutation.oldValue;
      const newValue = target.getAttribute ? target.getAttribute(attrName) : undefined;

      if (oldValue !== newValue) {
        this.record({
          type: 'attribute_change',
          selector: this.getSelector(target),
          data: {
            attributeName: attrName,
            oldValue: oldValue,
            newValue: newValue
          }
        });
      }
    }

    setupMediaListeners() {
      var self = this;
      var mediaSelector = 'video, audio';

      document.addEventListener('play', function(e) {
        if (e.target.matches && e.target.matches(mediaSelector)) {
          self.record({
            type: 'media_play',
            selector: self.getSelector(e.target),
            data: {
              currentTime: e.target.currentTime,
              duration: e.target.duration,
              muted: e.target.muted
            }
          });
        }
      }, true);

      document.addEventListener('pause', function(e) {
        if (e.target.matches && e.target.matches(mediaSelector)) {
          self.record({
            type: 'media_pause',
            selector: self.getSelector(e.target),
            data: {
              currentTime: e.target.currentTime,
              duration: e.target.duration,
              muted: e.target.muted
            }
          });
        }
      }, true);

      document.addEventListener('ended', function(e) {
        if (e.target.matches && e.target.matches(mediaSelector)) {
          self.record({
            type: 'media_ended',
            selector: self.getSelector(e.target),
            data: {
              currentTime: e.target.currentTime,
              duration: e.target.duration
            }
          });
        }
      }, true);

      document.addEventListener('seeked', function(e) {
        if (e.target.matches && e.target.matches(mediaSelector)) {
          self.record({
            type: 'media_seek',
            selector: self.getSelector(e.target),
            data: {
              currentTime: e.target.currentTime,
              duration: e.target.duration
            }
          });
        }
      }, true);
    }

    setupDropdownListeners() {
      var self = this;
      document.addEventListener('change', function(e) {
        if (e.target.tagName === 'SELECT') {
          var select = e.target;
          self.record({
            type: 'dropdown_close',
            selector: self.getSelector(select),
            data: {
              selectedValue: select.value,
              selectedIndex: select.selectedIndex
            }
          });
        }
      }, true);
    }

    interceptHistory() {
      var self = this;
      var originalPushState = history.pushState;
      var originalReplaceState = history.replaceState;

      history.pushState = function(state, title, url) {
        var result = originalPushState.apply(this, arguments);
        self.record({
          type: 'navigation',
          data: {
            url: window.location.href,
            navigationType: 'pushState',
            state: state ? JSON.stringify(state) : undefined
          }
        });
        return result;
      };

      history.replaceState = function(state, title, url) {
        var result = originalReplaceState.apply(this, arguments);
        self.record({
          type: 'navigation',
          data: {
            url: window.location.href,
            navigationType: 'replaceState',
            state: state ? JSON.stringify(state) : undefined
          }
        });
        return result;
      };
    }

    monitorNetwork() {
      var self = this;

      if (window.fetch) {
        var originalFetch = window.fetch;
        window.fetch = function() {
          self.networkRequests++;
          return originalFetch.apply(this, arguments).finally(function() {
            self.networkRequests--;
          });
        };
      }

      var originalXHRSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function() {
        var xhr = this;
        self.networkRequests++;
        xhr.addEventListener('loadend', function() {
          self.networkRequests--;
        });
        return originalXHRSend.apply(this, arguments);
      };
    }
  }

  window.__pageRecorder = new PageRecorder();
  console.log('[PageRecorder] Instance created and attached to window');

  // Bind event listeners immediately in addInitScript context
  // This is where exposeFunction is accessible
  // Use DOMContentLoaded or bind immediately if document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.__pageRecorder.bindEventListeners();
    });
  } else {
    // Document is already ready
    window.__pageRecorder.bindEventListeners();
  }
})();
`;
}
