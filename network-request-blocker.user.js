// ==UserScript==
// @name         Comprehensive Network Request Blocker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Block network requests (GET, POST, and others) similar to Chrome DevTools' Network block function
// @author       Your Name
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/briandyy/urlreqblockerscript/main/network-request-blocker.user.js
// @downloadURL  https://raw.githubusercontent.com/briandyy/urlreqblockerscript/main/network-request-blocker.user.js
// ==/UserScript==

(function() {
    'use strict';

    // === Configuration ===
    // Add URLs or patterns you want to block
    const blockedUrls = [
        // Exact URLs with protocol
        'https://online-test.pintro.id/livewire/message/keluar-ujian-component',
        'https://w.deepl.com/account?request_type=jsonrpc&il=en&method=logout',
        'https://online-test.pintro.id/assets/images/templates/tab.svg',

        // Patterns (using regular expressions)
        /^https?:\/\/.*\.png$/,
        /^https?:\/\/.*\.jpg$/,
        /^https?:\/\/.*\.svg$/,
        /^https?:\/\/.*\/ads\//,
        /^https?:\/\/tracking\.pixel\.com\//, // Added regex for DeepL logout with any query parameters
        // Add more patterns as needed
    ];

    // Utility function to check if a URL matches any blocked pattern
    function isBlocked(url) {
        try {
            const parsedUrl = new URL(url, window.location.origin);
            const fullUrl = parsedUrl.href;
            const hostname = parsedUrl.hostname;
            const pathname = parsedUrl.pathname;
            const search = parsedUrl.search;

            return blockedUrls.some(pattern => {
                if (typeof pattern === 'string') {
                    return fullUrl === pattern;
                } else if (pattern instanceof RegExp) {
                    return pattern.test(fullUrl);
                }
                return false;
            });
        } catch (e) {
            console.warn('Failed to parse URL:', url, e);
            return false;
        }
    }

    // === Override Fetch ===
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        let url = '';
        let method = 'GET'; // Default method

        if (typeof args[0] === 'string' || args[0] instanceof URL) {
            url = args[0].toString();
            if (args[1] && args[1].method) {
                method = args[1].method.toUpperCase();
            }
        } else if (args[0] instanceof Request) {
            url = args[0].url;
            method = args[0].method.toUpperCase();
        }

        if (isBlocked(url)) {
            console.warn(`Blocked fetch request (${method}) to:`, url);
            return Promise.reject(new Error('Blocked by Tampermonkey Network Request Blocker'));
        }

        return originalFetch.apply(this, args);
    };

    // === Override XMLHttpRequest ===
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._method = method.toUpperCase();
        this._url = url;

        if (isBlocked(url)) {
            console.warn(`Blocked XMLHttpRequest (${this._method}) to:`, url);
            this.abort();
            return;
        }

        return originalXHROpen.apply(this, arguments);
    };

    // === Override navigator.sendBeacon ===
    if (navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
            if (isBlocked(url)) {
                console.warn(`Blocked sendBeacon request to:`, url);
                return false; // Indicates the request was not sent
            }
            return originalSendBeacon.apply(this, arguments);
        };
    }

    // === Override WebSocket ===
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        if (isBlocked(url)) {
            console.warn(`Blocked WebSocket connection to:`, url);
            throw new Error('Blocked by Tampermonkey Network Request Blocker');
        }
        return new OriginalWebSocket(url, protocols);
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // === Intercept Resource Loading via HTML Elements ===
    const resourceAttributes = {
        'script': 'src',
        'img': 'src',
        'iframe': 'src',
        'link': 'href',
        'video': 'src',
        'audio': 'src',
        'source': 'src',
        'object': 'data',
        'embed': 'src',
        // Add more elements and their attributes as needed
    };

    // Function to block resource loading by removing the attribute or the element
    function blockResource(element) {
        for (const [tag, attr] of Object.entries(resourceAttributes)) {
            if (element.tagName.toLowerCase() === tag) {
                const url = element.getAttribute(attr);
                if (url && isBlocked(url)) {
                    console.warn(`Blocked ${tag} resource (${attr}) from:`, url);
                    // Option 1: Remove the attribute to prevent loading
                    element.removeAttribute(attr);

                    // Option 2: Alternatively, remove the entire element
                    // element.parentNode && element.parentNode.removeChild(element);
                }
            }
        }
    }

    // Override methods that add elements to the DOM
    const originalAppendChild = Element.prototype.appendChild;
    Element.prototype.appendChild = function(child) {
        if (child instanceof HTMLElement) {
            blockResource(child);
        }
        return originalAppendChild.apply(this, arguments);
    };

    const originalInsertBefore = Element.prototype.insertBefore;
    Element.prototype.insertBefore = function(newNode, referenceNode) {
        if (newNode instanceof HTMLElement) {
            blockResource(newNode);
        }
        return originalInsertBefore.apply(this, arguments);
    };

    // MutationObserver to monitor dynamically added elements
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) {
                    blockResource(node);
                    // Additionally, check child elements
                    node.querySelectorAll(Object.keys(resourceAttributes).join(',')).forEach(child => {
                        blockResource(child);
                    });
                }
            }
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // === Override CSS Import ===
    // To block @import in stylesheets
    const originalInsertRule = CSSStyleSheet.prototype.insertRule;
    CSSStyleSheet.prototype.insertRule = function(rule, index) {
        if (/@import\s+url\(["']?(.*?)["']?\)/i.test(rule)) {
            const urlMatch = rule.match(/@import\s+url\(["']?(.*?)["']?\)/i);
            if (urlMatch && isBlocked(urlMatch[1])) {
                console.warn('Blocked @import rule:', urlMatch[1]);
                return;
            }
        }
        return originalInsertRule.apply(this, arguments);
    };

    // === Override Element.setAttribute ===
    // To block setting attributes that load resources
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        const tag = this.tagName.toLowerCase();
        if (resourceAttributes[tag] && name === resourceAttributes[tag]) {
            if (isBlocked(value)) {
                console.warn(`Blocked setting ${resourceAttributes[tag]} attribute for <${tag}> to:`, value);
                return; // Do not set the attribute
            }
        }
        return originalSetAttribute.apply(this, arguments);
    };

    // === Override Element.src and Element.href Properties ===
    // To block setting src/href via property assignments
    const elementSrcDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'src');
    if (elementSrcDescriptor && elementSrcDescriptor.set) {
        Object.defineProperty(Element.prototype, 'src', {
            set: function(value) {
                if (isBlocked(value)) {
                    console.warn(`Blocked setting 'src' property for <${this.tagName.toLowerCase()}> to:`, value);
                    return; // Do not set the property
                }
                elementSrcDescriptor.set.call(this, value);
            },
            get: elementSrcDescriptor.get,
            configurable: true,
            enumerable: true,
        });
    }

    const elementHrefDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'href');
    if (elementHrefDescriptor && elementHrefDescriptor.set) {
        Object.defineProperty(Element.prototype, 'href', {
            set: function(value) {
                if (isBlocked(value)) {
                    console.warn(`Blocked setting 'href' property for <${this.tagName.toLowerCase()}> to:`, value);
                    return; // Do not set the property
                }
                elementHrefDescriptor.set.call(this, value);
            },
            get: elementHrefDescriptor.get,
            configurable: true,
            enumerable: true,
        });
    }

    // === Override Import Scripts Dynamically ===
    // To block dynamically added scripts via eval or other methods
    const originalEval = window.eval;
    window.eval = function(code) {
        // Optionally, scan the code for blocked URLs or suspicious patterns
        // This is a basic implementation and might need to be enhanced
        return originalEval.apply(this, arguments);
    };

    // === Handle Service Workers ===
    // Note: Tampermonkey cannot intercept Service Worker registrations directly.
    // Users may need to unregister Service Workers manually or use other methods.

    // === Additional Network APIs ===
    // Add overrides for other network APIs if necessary

})();
