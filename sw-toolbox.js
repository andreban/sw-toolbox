(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.toolbox = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
	Copyright 2015 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

class CacheOptions {
  constructor(options) {
    options = options || {};

    this._name = options.name || '$$$toolbox-cache$$$';
    this._maxAgeSeconds = options.maxAgeSeconds || null;
    this._maxEntries = options.maxEntries || null;
  }

  get name() {
    return this._name;
  }

  set name(name) {
    if (typeof name !== 'string' || name.length === 0) {
      console.warn('options.cache.name must be a string ' +
        '. Ignoring new value: ' + name);
      return;
    }

    this._name = name;
  }

  get maxAgeSeconds() {
    return this._maxAgeSeconds;
  }

  set maxAgeSeconds(maxAgeSeconds) {
    if (maxAgeSeconds !== null && typeof maxAgeSeconds !== 'number') {
      console.warn('options.maxAgeSeconds must be a a number ' +
        'or null. Ignoring new value: ' + maxAgeSeconds);
      return;
    }

    this._maxAgeSeconds = maxAgeSeconds;
  }

  get maxEntries() {
    return this._maxEntries;
  }

  set maxEntries(maxEntries) {
    if (maxEntries !== null && typeof maxEntries !== 'number') {
      console.warn('options.maxEntries must be a a number ' +
        'or null. Ignoring new value: ' + maxEntries);
      return;
    }

    this._maxEntries = maxEntries;
  }
}

class GlobalOptions {
  constructor() {
    this.DEBUG_DEFAULT = false;
    this.NETWORK_TIMEOUT_DEFAULT = null;
    this.SUCCESS_RESPONSES_DEFAULT = /^0|([123]\d\d)|(40[14567])|410$/;

    this.initialise();
  }

  initialise(newOptions) {
    newOptions = newOptions || {};

    this._debug = newOptions.debug || this.DEBUG_DEFAULT;
    this._networkTimeoutSeconds =
      newOptions.networkTimeoutSeconds || this.NETWORK_TIMEOUT_DEFAULT;
    this._successResponses =
      newOptions.successResponses || this.SUCCESS_RESPONSES_DEFAULT;
    this._cache = newOptions.cache ?
      new CacheOptions(newOptions.cache) : new CacheOptions();
  }

  get debug() {
    return this._debug;
  }

  set debug(debugValue) {
    if (typeof debugValue !== 'boolean') {
      console.warn('options.debug must be a true or false boolean. ' +
        'Ignoring new value: ' + debugValue);
      return;
    }

    this._debug = debugValue;
  }

  get networkTimeoutSeconds() {
    return this._networkTimeoutSeconds;
  }

  set networkTimeoutSeconds(timeoutSecs) {
    if (timeoutSecs !== null && typeof timeoutSecs !== 'number') {
      console.warn('options.networkTimeoutSeconds must be a a number ' +
        'or null. Ignoring new value: ' + timeoutSecs);
      return;
    }

    this._networkTimeoutSeconds = timeoutSecs;
  }

  get cache() {
    return this._cache;
  }

  set cache(newCache) {
    this._cache = new CacheOptions(newCache);
  }

  // A regular expression to apply to HTTP response codes. Codes that match
  // will be considered successes, while others will not, and will not be
  // cached.
  get successResponses() {
    return this._successResponses;
  }
}

module.exports = new GlobalOptions();

},{}],2:[function(require,module,exports){
/*
	Copyright 2015 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('./logger.js');
const globalOptions = require('../global-options');
const idbCacheExpiration = require('../idb-cache-expiration');

let cleanupQueue;

function renameCache(source, destination) {
  logger.debug('Renaming cache: [' + source + '] to [' + destination + ']');
  return caches.delete(destination).then(function() {
    return Promise.all([
      caches.open(source),
      caches.open(destination)
    ]).then(function(results) {
      var sourceCache = results[0];
      var destCache = results[1];

      return sourceCache.keys().then(function(requests) {
        return Promise.all(requests.map(function(request) {
          return sourceCache.match(request).then(function(response) {
            return destCache.put(request, response);
          });
        }));
      }).then(function() {
        return caches.delete(source);
      });
    });
  });
}

function cleanupCache(request, cache) {
  var requestUrl = request.url;
  var maxAgeSeconds = globalOptions.cache.maxAgeSeconds;
  var maxEntries = globalOptions.cache.maxEntries;
  var cacheName = globalOptions.cache.name;

  var now = Date.now();
  logger.debug('Updating LRU order for ' + requestUrl + '. Max entries is ' +
    maxEntries + ', max age is ' + maxAgeSeconds);

  return idbCacheExpiration.getDb(cacheName).then(function(db) {
    return idbCacheExpiration.setTimestampForUrl(db, requestUrl, now);
  }).then(function(db) {
    return idbCacheExpiration.expireEntries(db, maxEntries, maxAgeSeconds, now);
  }).then(function(urlsToDelete) {
    logger.debug('Successfully updated IDB.');

    var deletionPromises = urlsToDelete.map(function(urlToDelete) {
      return cache.delete(urlToDelete);
    });

    return Promise.all(deletionPromises).then(function() {
      logger.debug('Done with cache cleanup.');
    });
  }).catch(function(error) {
    logger.debug(error);
  });
}

function queueCacheExpiration(request, cache) {
  var cleanup = cleanupCache.bind(null, request, cache);

  if (cleanupQueue) {
    cleanupQueue = cleanupQueue.then(cleanup);
  } else {
    cleanupQueue = cleanup();
  }
}

function fetchAndCache(request) {
  const successResponses = globalOptions.successResponses;

  return fetch(request.clone())
  .then(function(response) {
    // Only cache GET requests with successful responses.
    // Since this is not part of the promise chain, it will be done
    // asynchronously and will not block the response from being returned to the
    // page.
    if (request.method === 'GET' && successResponses.test(response.status)) {
      caches.open(globalOptions.cache.name)
      .then(cache => {
        return cache.put(request, response)
        .then(cache => {
          // Only run the cache expiration logic if at least one of the maximums
          // is set, and if we have a name for the cache that the options are
          // being applied to.
          // TODO: The cache should always have a name, when wouldn't it?
          if ((globalOptions.cache.maxEntries ||
              globalOptions.cache.maxAgeSeconds) &&
              globalOptions.cache.name) {
            queueCacheExpiration(request, cache);
          }
        });
      });
    }

    return response.clone();
  });
}

module.exports = {
  renameCache: renameCache,
  fetchAndCache: fetchAndCache
};

},{"../global-options":1,"../idb-cache-expiration":4,"./logger.js":3}],3:[function(require,module,exports){
/*
	Copyright 2015 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const globalOptions = require('../global-options.js');

module.exports = {
  debug: function(message, options) {
    options = options || {};
    var flag = options.debug || globalOptions.debug;
    if (flag) {
      console.log('[sw-toolbox] ' + message);
    }
  }
};

},{"../global-options.js":1}],4:[function(require,module,exports){
/*
 Copyright 2015 Google Inc. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
'use strict';

var DB_PREFIX = 'sw-toolbox-';
var DB_VERSION = 1;
var STORE_NAME = 'store';
var URL_PROPERTY = 'url';
var TIMESTAMP_PROPERTY = 'timestamp';
var cacheNameToDbPromise = {};

function openDb(cacheName) {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_PREFIX + cacheName, DB_VERSION);

    request.onupgradeneeded = function() {
      var objectStore = request.result.createObjectStore(STORE_NAME,
          {keyPath: URL_PROPERTY});
      objectStore.createIndex(TIMESTAMP_PROPERTY, TIMESTAMP_PROPERTY,
          {unique: false});
    };

    request.onsuccess = function() {
      resolve(request.result);
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}

function getDb(cacheName) {
  if (!(cacheName in cacheNameToDbPromise)) {
    cacheNameToDbPromise[cacheName] = openDb(cacheName);
  }

  return cacheNameToDbPromise[cacheName];
}

function setTimestampForUrl(db, url, now) {
  return new Promise(function(resolve, reject) {
    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    objectStore.put({url: url, timestamp: now});

    transaction.oncomplete = function() {
      resolve(db);
    };

    transaction.onabort = function() {
      reject(transaction.error);
    };
  });
}

function expireOldEntries(db, maxAgeSeconds, now) {
  // Bail out early by resolving with an empty array if we're not using
  // maxAgeSeconds.
  if (!maxAgeSeconds) {
    return Promise.resolve([]);
  }

  return new Promise(function(resolve, reject) {
    var maxAgeMillis = maxAgeSeconds * 1000;
    var urls = [];

    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    var index = objectStore.index(TIMESTAMP_PROPERTY);

    index.openCursor().onsuccess = function(cursorEvent) {
      var cursor = cursorEvent.target.result;
      if (cursor) {
        if (now - maxAgeMillis > cursor.value[TIMESTAMP_PROPERTY]) {
          var url = cursor.value[URL_PROPERTY];
          urls.push(url);
          objectStore.delete(url);
          cursor.continue();
        }
      }
    };

    transaction.oncomplete = function() {
      resolve(urls);
    };

    transaction.onabort = reject;
  });
}

function expireExtraEntries(db, maxEntries) {
  // Bail out early by resolving with an empty array if we're not using
  // maxEntries.
  if (!maxEntries) {
    return Promise.resolve([]);
  }

  return new Promise(function(resolve, reject) {
    var urls = [];

    var transaction = db.transaction(STORE_NAME, 'readwrite');
    var objectStore = transaction.objectStore(STORE_NAME);
    var index = objectStore.index(TIMESTAMP_PROPERTY);

    var countRequest = index.count();
    index.count().onsuccess = function() {
      var initialCount = countRequest.result;

      if (initialCount > maxEntries) {
        index.openCursor().onsuccess = function(cursorEvent) {
          var cursor = cursorEvent.target.result;
          if (cursor) {
            var url = cursor.value[URL_PROPERTY];
            urls.push(url);
            objectStore.delete(url);
            if (initialCount - urls.length > maxEntries) {
              cursor.continue();
            }
          }
        };
      }
    };

    transaction.oncomplete = function() {
      resolve(urls);
    };

    transaction.onabort = reject;
  });
}

function expireEntries(db, maxEntries, maxAgeSeconds, now) {
  return expireOldEntries(db, maxAgeSeconds, now).then(function(oldUrls) {
    return expireExtraEntries(db, maxEntries).then(function(extraUrls) {
      return oldUrls.concat(extraUrls);
    });
  });
}

module.exports = {
  getDb: getDb,
  setTimestampForUrl: setTimestampForUrl,
  expireEntries: expireEntries
};

},{}],5:[function(require,module,exports){
/*
  Copyright 2014 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';

// TODO: Use self.registration.scope instead of self.location
var url = new URL('./', self.location);
var basePath = url.pathname;
var pathRegexp = require('path-to-regexp');

var Route = function(method, path, handler, options) {
  if (path instanceof RegExp) {
    this.fullUrlRegExp = path;
  } else {
    // The URL() constructor can't parse express-style routes as they are not
    // valid urls. This means we have to manually manipulate relative urls into
    // absolute ones. This check is extremely naive but implementing a tweaked
    // version of the full algorithm seems like overkill
    // (https://url.spec.whatwg.org/#concept-basic-url-parser)
    if (path.indexOf('/') !== 0) {
      path = basePath + path;
    }

    this.keys = [];
    this.regexp = pathRegexp(path, this.keys);
  }

  this.method = method;
  this.options = options;
  this.handler = handler;
};

Route.prototype.makeHandler = function(url) {
  var values;
  if (this.regexp) {
    var match = this.regexp.exec(url);
    values = {};
    this.keys.forEach(function(key, index) {
      values[key.name] = match[index + 1];
    });
  }

  return function(request) {
    return this.handler(request, values, this.options);
  }.bind(this);
};

module.exports = Route;

},{"path-to-regexp":14}],6:[function(require,module,exports){
/*
  Copyright 2014 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';

var Route = require('./route');

function regexEscape(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var keyMatch = function(map, string) {
  // This would be better written as a for..of loop, but that would break the
  // minifyify process in the build.
  var entriesIterator = map.entries();
  var item = entriesIterator.next();
  var matches = [];
  while (!item.done) {
    var pattern = new RegExp(item.value[0]);
    if (pattern.test(string)) {
      matches.push(item.value[1]);
    }
    item = entriesIterator.next();
  }
  return matches;
};

var Router = function() {
  this.routes = new Map();
  // Create the dummy origin for RegExp-based routes
  this.routes.set(RegExp, new Map());
  this.default = null;
};

['get', 'post', 'put', 'delete', 'head', 'any'].forEach(function(method) {
  Router.prototype[method] = function(path, handler, options) {
    return this.add(method, path, handler, options);
  };
});

Router.prototype.add = function(method, path, handler, options) {
  options = options || {};
  var origin;

  if (path instanceof RegExp) {
    // We need a unique key to use in the Map to distinguish RegExp paths
    // from Express-style paths + origins. Since we can use any object as the
    // key in a Map, let's use the RegExp constructor!
    origin = RegExp;
  } else {
    origin = options.origin || self.location.origin;
    if (origin instanceof RegExp) {
      origin = origin.source;
    } else {
      origin = regexEscape(origin);
    }
  }

  method = method.toLowerCase();

  var route = new Route(method, path, handler, options);

  if (!this.routes.has(origin)) {
    this.routes.set(origin, new Map());
  }

  var methodMap = this.routes.get(origin);
  if (!methodMap.has(method)) {
    methodMap.set(method, new Map());
  }

  var routeMap = methodMap.get(method);
  var regExp = route.regexp || route.fullUrlRegExp;
  routeMap.set(regExp.source, route);
};

Router.prototype.matchMethod = function(method, url) {
  var urlObject = new URL(url);
  var origin = urlObject.origin;
  var path = urlObject.pathname;

  // We want to first check to see if there's a match against any
  // "Express-style" routes (string for the path, RegExp for the origin).
  // Checking for Express-style matches first maintains the legacy behavior.
  // If there's no match, we next check for a match against any RegExp routes,
  // where the RegExp in question matches the full URL (both origin and path).
  return this._match(method, keyMatch(this.routes, origin), path) ||
    this._match(method, [this.routes.get(RegExp)], url);
};

Router.prototype._match = function(method, methodMaps, pathOrUrl) {
  if (methodMaps.length === 0) {
    return null;
  }

  for (var i = 0; i < methodMaps.length; i++) {
    var methodMap = methodMaps[i];
    var routeMap = methodMap && methodMap.get(method.toLowerCase());
    if (routeMap) {
      var routes = keyMatch(routeMap, pathOrUrl);
      if (routes.length > 0) {
        return routes[0].makeHandler(pathOrUrl);
      }
    }
  }

  return null;
};

Router.prototype.match = function(request) {
  return this.matchMethod(request.method, request.url) ||
      this.matchMethod('any', request.url);
};

module.exports = new Router();

},{"./route":5}],7:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('../helpers/logger');
const cacheHelpers = require('../helpers/cache');
const globalOptions = require('../global-options');

function cacheFirst(request, values) {
  logger.debug('Strategy: cache first [' + request.url + ']');
  return caches.open(globalOptions.cache.name)
  .then(function(cache) {
    return cache.match(request).then(function(response) {
      if (response) {
        return response;
      }

      return cacheHelpers.fetchAndCache(request);
    });
  });
}

module.exports = cacheFirst;

},{"../global-options":1,"../helpers/cache":2,"../helpers/logger":3}],8:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('../helpers/logger');
const cacheHelpers = require('../helpers/cache');
const globalOptions = require('../global-options');

function cacheOnly(request, values) {
  logger.debug('Strategy: cache only [' + request.url + ']');
  return caches.open(globalOptions.cache.name)
  .then(function(cache) {
    return cache.match(request);
  });
}

module.exports = cacheOnly;

},{"../global-options":1,"../helpers/cache":2,"../helpers/logger":3}],9:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('../helpers/logger');
const cacheHelpers = require('../helpers/cache');
const cacheOnly = require('./cacheOnly');

function fastest(request, values) {
  logger.debug('Strategy: fastest [' + request.url + ']');

  return new Promise(function(resolve, reject) {
    var rejected = false;
    var reasons = [];

    var maybeReject = function(reason) {
      reasons.push(reason.toString());
      if (rejected) {
        reject(new Error('Both cache and network failed: "' +
            reasons.join('", "') + '"'));
      } else {
        rejected = true;
      }
    };

    var maybeResolve = function(result) {
      if (result instanceof Response) {
        resolve(result);
      } else {
        maybeReject('No result returned');
      }
    };

    cacheHelpers.fetchAndCache(request.clone())
      .then(maybeResolve, maybeReject);

    cacheOnly(request, values)
      .then(maybeResolve, maybeReject);
  });
}

module.exports = fastest;

},{"../helpers/cache":2,"../helpers/logger":3,"./cacheOnly":8}],10:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/
module.exports = {
  networkOnly: require('./networkOnly'),
  networkFirst: require('./networkFirst'),
  cacheOnly: require('./cacheOnly'),
  cacheFirst: require('./cacheFirst'),
  fastest: require('./fastest')
};

},{"./cacheFirst":7,"./cacheOnly":8,"./fastest":9,"./networkFirst":11,"./networkOnly":12}],11:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('../helpers/logger');
const cacheHelpers = require('../helpers/cache');
const globalOptions = require('../global-options');

function networkFirst(request, values, options) {
  logger.debug('Strategy: network first [' + request.url + ']', options);

  return caches.open(globalOptions.cache.name)
  .then(function(cache) {
    var timeoutId;
    var promises = [];
    var originalResponse;

    if (globalOptions.cache.networkTimeoutSeconds) {
      var cacheWhenTimedOutPromise = new Promise(function(resolve) {
        timeoutId = setTimeout(function() {
          cache.match(request).then(function(response) {
            if (response) {
              // Only resolve this promise if there's a valid response in the
              // cache. This ensures that we won't time out a network request
              // unless there's a cached entry to fallback on, which is arguably
              // the preferable behavior.
              resolve(response);
            }
          });
        }, globalOptions.cache.networkTimeoutSeconds * 1000);
      });
      promises.push(cacheWhenTimedOutPromise);
    }

    var networkPromise = cacheHelpers.fetchAndCache(request, options)
      .then(function(response) {
        // We've got a response, so clear the network timeout if there is one.
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (globalOptions.successResponses.test(response.status)) {
          return response;
        }

        logger.debug('Response was an HTTP error: ' + response.statusText,
            options);
        originalResponse = response;
        throw new Error('Bad response');
      }).catch(function(error) {
        logger.debug('Network or response error, fallback to cache [' +
            request.url + ']', options);
        return cache.match(request).then(function(response) {
          // If there's a match in the cache, resolve with that.
          if (response) {
            return response;
          }

          // If we have a Response object from the previous fetch, then resolve
          // with that, even though it corresponds to an error status code.
          if (originalResponse) {
            return originalResponse;
          }

          // If we don't have a Response object from the previous fetch, likely
          // due to a network failure, then reject with the failure error.
          throw error;
        });
      });

    promises.push(networkPromise);

    return Promise.race(promises);
  });
}

module.exports = networkFirst;

},{"../global-options":1,"../helpers/cache":2,"../helpers/logger":3}],12:[function(require,module,exports){
/*
	Copyright 2014 Google Inc. All Rights Reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

'use strict';

const logger = require('../helpers/logger');

function networkOnly(request, values, options) {
  logger.debug('Strategy: network only [' + request.url + ']', options);
  return fetch(request);
}

module.exports = networkOnly;

},{"../helpers/logger":3}],13:[function(require,module,exports){
/*
  Copyright 2014 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';

// We should still use this to polyfill the stricter cache.add and
// cache.addAll. Remove when Chrome version 50 and FF version 46 are
// the norm as these have the correct behaviour
require('serviceworker-cache-polyfill');

const logger = require('./helpers/logger.js');
const cacheHelper = require('./helpers/cache.js');
const globalOptions = require('./global-options.js');
const router = require('./router');
const strategies = require('./strategies');

class SWToolbox {
  constructor() {
    logger.debug('Service Worker Toolbox is loading');

    this.router = router;
    Object.keys(strategies).forEach(strategyName => {
      this[strategyName] = strategies[strategyName];
    });

    self.addEventListener('fetch', function(event) {
      const handler = router.match(event.request);

      if (handler) {
        event.respondWith(handler(event.request));
      } else if (router.default && event.request.method === 'GET') {
        event.respondWith(router.default(event.request));
      }
    });
  }

  get options() {
    return globalOptions;
  }

  set options(newOptions) {
    globalOptions.initialise(newOptions);
  }

  _validatePrecacheInput(items) {
    var isValid = Array.isArray(items);
    if (isValid) {
      items.forEach(function(item) {
        if (!(typeof item === 'string' || (item instanceof Request))) {
          isValid = false;
        }
      });
    }

    return isValid;
  }

  _validatePrecacheManifestInput(manifest) {
    var isValid = Array.isArray(manifest);
    if (isValid) {
      manifest.forEach(manifestEntry => {
        if (typeof manifestEntry.url === 'undefined' ||
          manifestEntry.url instanceof String ||
          manifestEntry.url.length === 0) {
          isValid = false;
        } else if (typeof manifestEntry.fileRevision === 'undefined' ||
          manifestEntry.fileRevision instanceof String ||
          manifestEntry.fileRevision.length === 0) {
          isValid = false;
        }
      });
    }

    if (!isValid) {
      throw new TypeError('The precacheFromManifest method expects either an ' +
      'array of strings and/or Requests or a Promise that resolves to an ' +
      'array of strings and/or Requests.');
    }

    return manifest;
  }

  precache(items) {
    if (!(items instanceof Promise) && !this._validatePrecacheInput(items)) {
      throw new TypeError('The precache method expects either an array of ' +
      'strings and/or Requests or a Promise that resolves to an array of ' +
      'strings and/or Requests.');
    }

    // Either Promise of valid
    self.addEventListener('install', event => {
      logger.debug('install event fired');

      const inactiveCacheName = globalOptions.cache.name + '$$$inactive$$$';
      logger.debug('creating cache [' + inactiveCacheName + ']');

      event.waitUntil(
        caches.open(inactiveCacheName)
        .then(cache => {
          let promiseChain = Promise.resolve(items);
          if (items instanceof Promise) {
            promiseChain = items;
          }

          return promiseChain
          .then(precacheItems => {
            if (!this._validatePrecacheInput(precacheItems)) {
              throw new TypeError('The precache method expects either an ' +
              'array of strings and/or Requests or a Promise that resolves ' +
              'to an array of strings and/or Requests.');
            }

            logger.debug('preCache list: ' +
              (precacheItems.join(', ') || '(none)'));

            return cache.addAll(precacheItems);
          });
        })
      );
    });

    self.addEventListener('activate', function(event) {
      logger.debug('activate event fired');
      const inactiveCacheName = globalOptions.cache.name + '$$$inactive$$$';
      event.waitUntil(
        cacheHelper.renameCache(inactiveCacheName, globalOptions.cache.name)
      );
    });
  }

  precacheFromManifest(manifest) {
    if (!(manifest instanceof Promise)) {
      this._validatePrecacheManifestInput(manifest);
    }
  }

  cache(url) {
    return caches.open(globalOptions)
    .then(function(cache) {
      return cache.add(url);
    });
  }

  uncache(url) {
    return caches.open(globalOptions)
    .then(function(cache) {
      return cache.delete(url);
    });
  }
}

module.exports = new SWToolbox();

},{"./global-options.js":1,"./helpers/cache.js":2,"./helpers/logger.js":3,"./router":6,"./strategies":10,"serviceworker-cache-polyfill":16}],14:[function(require,module,exports){
var isarray = require('isarray')

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp
module.exports.parse = parse
module.exports.compile = compile
module.exports.tokensToFunction = tokensToFunction
module.exports.tokensToRegExp = tokensToRegExp

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

/**
 * Parse a string for the raw tokens.
 *
 * @param  {String} str
 * @return {Array}
 */
function parse (str) {
  var tokens = []
  var key = 0
  var index = 0
  var path = ''
  var res

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0]
    var escaped = res[1]
    var offset = res.index
    path += str.slice(index, offset)
    index = offset + m.length

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1]
      continue
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path)
      path = ''
    }

    var prefix = res[2]
    var name = res[3]
    var capture = res[4]
    var group = res[5]
    var suffix = res[6]
    var asterisk = res[7]

    var repeat = suffix === '+' || suffix === '*'
    var optional = suffix === '?' || suffix === '*'
    var delimiter = prefix || '/'
    var pattern = capture || group || (asterisk ? '.*' : '[^' + delimiter + ']+?')

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      pattern: escapeGroup(pattern)
    })
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index)
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path)
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {String}   str
 * @return {Function}
 */
function compile (str) {
  return tokensToFunction(parse(str))
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length)

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^' + tokens[i].pattern + '$')
    }
  }

  return function (obj) {
    var path = ''
    var data = obj || {}

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]

      if (typeof token === 'string') {
        path += token

        continue
      }

      var value = data[token.name]
      var segment

      if (value == null) {
        if (token.optional) {
          continue
        } else {
          throw new TypeError('Expected "' + token.name + '" to be defined')
        }
      }

      if (isarray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but received "' + value + '"')
        }

        if (value.length === 0) {
          if (token.optional) {
            continue
          } else {
            throw new TypeError('Expected "' + token.name + '" to not be empty')
          }
        }

        for (var j = 0; j < value.length; j++) {
          segment = encodeURIComponent(value[j])

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment
        }

        continue
      }

      segment = encodeURIComponent(value)

      if (!matches[i].test(segment)) {
        throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
      }

      path += token.prefix + segment
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {String} str
 * @return {String}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1')
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys
  return re
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {String}
 */
function flags (options) {
  return options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {RegExp} path
 * @param  {Array}  keys
 * @return {RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g)

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        pattern: null
      })
    }
  }

  return attachKeys(path, keys)
}

/**
 * Transform an array into a regexp.
 *
 * @param  {Array}  path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = []

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source)
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options))

  return attachKeys(regexp, keys)
}

/**
 * Create a path regexp from string input.
 *
 * @param  {String} path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function stringToRegexp (path, keys, options) {
  var tokens = parse(path)
  var re = tokensToRegExp(tokens, options)

  // Attach keys back to the regexp.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] !== 'string') {
      keys.push(tokens[i])
    }
  }

  return attachKeys(re, keys)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {Array}  tokens
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function tokensToRegExp (tokens, options) {
  options = options || {}

  var strict = options.strict
  var end = options.end !== false
  var route = ''
  var lastToken = tokens[tokens.length - 1]
  var endsWithSlash = typeof lastToken === 'string' && /\/$/.test(lastToken)

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i]

    if (typeof token === 'string') {
      route += escapeString(token)
    } else {
      var prefix = escapeString(token.prefix)
      var capture = token.pattern

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*'
      }

      if (token.optional) {
        if (prefix) {
          capture = '(?:' + prefix + '(' + capture + '))?'
        } else {
          capture = '(' + capture + ')?'
        }
      } else {
        capture = prefix + '(' + capture + ')'
      }

      route += capture
    }
  }

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?'
  }

  if (end) {
    route += '$'
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithSlash ? '' : '(?=\\/|$)'
  }

  return new RegExp('^' + route, flags(options))
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 [keys]
 * @param  {Object}                [options]
 * @return {RegExp}
 */
function pathToRegexp (path, keys, options) {
  keys = keys || []

  if (!isarray(keys)) {
    options = keys
    keys = []
  } else if (!options) {
    options = {}
  }

  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys, options)
  }

  if (isarray(path)) {
    return arrayToRegexp(path, keys, options)
  }

  return stringToRegexp(path, keys, options)
}

},{"isarray":15}],15:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],16:[function(require,module,exports){
/**
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function() {
  var nativeAddAll = Cache.prototype.addAll;
  var userAgent = navigator.userAgent.match(/(Firefox|Chrome)\/(\d+\.)/);

  // Has nice behavior of `var` which everyone hates
  if (userAgent) {
    var agent = userAgent[1];
    var version = parseInt(userAgent[2]);
  }

  if (
    nativeAddAll && (!userAgent ||
      (agent === 'Firefox' && version >= 46) ||
      (agent === 'Chrome'  && version >= 50)
    )
  ) {
    return;
  }

  Cache.prototype.addAll = function addAll(requests) {
    var cache = this;

    // Since DOMExceptions are not constructable:
    function NetworkError(message) {
      this.name = 'NetworkError';
      this.code = 19;
      this.message = message;
    }

    NetworkError.prototype = Object.create(Error.prototype);

    return Promise.resolve().then(function() {
      if (arguments.length < 1) throw new TypeError();

      // Simulate sequence<(Request or USVString)> binding:
      var sequence = [];

      requests = requests.map(function(request) {
        if (request instanceof Request) {
          return request;
        }
        else {
          return String(request); // may throw TypeError
        }
      });

      return Promise.all(
        requests.map(function(request) {
          if (typeof request === 'string') {
            request = new Request(request);
          }

          var scheme = new URL(request.url).protocol;

          if (scheme !== 'http:' && scheme !== 'https:') {
            throw new NetworkError("Invalid scheme");
          }

          return fetch(request.clone());
        })
      );
    }).then(function(responses) {
      // If some of the responses has not OK-eish status,
      // then whole operation should reject
      if (responses.some(function(response) {
        return !response.ok;
      })) {
        throw new NetworkError('Incorrect response status');
      }

      // TODO: check that requests don't overwrite one another
      // (don't think this is possible to polyfill due to opaque responses)
      return Promise.all(
        responses.map(function(response, i) {
          return cache.put(requests[i], response);
        })
      );
    }).then(function() {
      return undefined;
    });
  };

  Cache.prototype.add = function add(request) {
    return this.addAll([request]);
  };
}());
},{}]},{},[13])(13)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZ2xvYmFsLW9wdGlvbnMuanMiLCJsaWIvaGVscGVycy9jYWNoZS5qcyIsImxpYi9oZWxwZXJzL2xvZ2dlci5qcyIsImxpYi9pZGItY2FjaGUtZXhwaXJhdGlvbi5qcyIsImxpYi9yb3V0ZS5qcyIsImxpYi9yb3V0ZXIuanMiLCJsaWIvc3RyYXRlZ2llcy9jYWNoZUZpcnN0LmpzIiwibGliL3N0cmF0ZWdpZXMvY2FjaGVPbmx5LmpzIiwibGliL3N0cmF0ZWdpZXMvZmFzdGVzdC5qcyIsImxpYi9zdHJhdGVnaWVzL2luZGV4LmpzIiwibGliL3N0cmF0ZWdpZXMvbmV0d29ya0ZpcnN0LmpzIiwibGliL3N0cmF0ZWdpZXMvbmV0d29ya09ubHkuanMiLCJsaWIvc3ctdG9vbGJveC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9ub2RlX21vZHVsZXMvaXNhcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zZXJ2aWNld29ya2VyLWNhY2hlLXBvbHlmaWxsL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0WUE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcblx0Q29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNsYXNzIENhY2hlT3B0aW9ucyB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHRoaXMuX25hbWUgPSBvcHRpb25zLm5hbWUgfHwgJyQkJHRvb2xib3gtY2FjaGUkJCQnO1xuICAgIHRoaXMuX21heEFnZVNlY29uZHMgPSBvcHRpb25zLm1heEFnZVNlY29uZHMgfHwgbnVsbDtcbiAgICB0aGlzLl9tYXhFbnRyaWVzID0gb3B0aW9ucy5tYXhFbnRyaWVzIHx8IG51bGw7XG4gIH1cblxuICBnZXQgbmFtZSgpIHtcbiAgICByZXR1cm4gdGhpcy5fbmFtZTtcbiAgfVxuXG4gIHNldCBuYW1lKG5hbWUpIHtcbiAgICBpZiAodHlwZW9mIG5hbWUgIT09ICdzdHJpbmcnIHx8IG5hbWUubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ29wdGlvbnMuY2FjaGUubmFtZSBtdXN0IGJlIGEgc3RyaW5nICcgK1xuICAgICAgICAnLiBJZ25vcmluZyBuZXcgdmFsdWU6ICcgKyBuYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9uYW1lID0gbmFtZTtcbiAgfVxuXG4gIGdldCBtYXhBZ2VTZWNvbmRzKCkge1xuICAgIHJldHVybiB0aGlzLl9tYXhBZ2VTZWNvbmRzO1xuICB9XG5cbiAgc2V0IG1heEFnZVNlY29uZHMobWF4QWdlU2Vjb25kcykge1xuICAgIGlmIChtYXhBZ2VTZWNvbmRzICE9PSBudWxsICYmIHR5cGVvZiBtYXhBZ2VTZWNvbmRzICE9PSAnbnVtYmVyJykge1xuICAgICAgY29uc29sZS53YXJuKCdvcHRpb25zLm1heEFnZVNlY29uZHMgbXVzdCBiZSBhIGEgbnVtYmVyICcgK1xuICAgICAgICAnb3IgbnVsbC4gSWdub3JpbmcgbmV3IHZhbHVlOiAnICsgbWF4QWdlU2Vjb25kcyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fbWF4QWdlU2Vjb25kcyA9IG1heEFnZVNlY29uZHM7XG4gIH1cblxuICBnZXQgbWF4RW50cmllcygpIHtcbiAgICByZXR1cm4gdGhpcy5fbWF4RW50cmllcztcbiAgfVxuXG4gIHNldCBtYXhFbnRyaWVzKG1heEVudHJpZXMpIHtcbiAgICBpZiAobWF4RW50cmllcyAhPT0gbnVsbCAmJiB0eXBlb2YgbWF4RW50cmllcyAhPT0gJ251bWJlcicpIHtcbiAgICAgIGNvbnNvbGUud2Fybignb3B0aW9ucy5tYXhFbnRyaWVzIG11c3QgYmUgYSBhIG51bWJlciAnICtcbiAgICAgICAgJ29yIG51bGwuIElnbm9yaW5nIG5ldyB2YWx1ZTogJyArIG1heEVudHJpZXMpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX21heEVudHJpZXMgPSBtYXhFbnRyaWVzO1xuICB9XG59XG5cbmNsYXNzIEdsb2JhbE9wdGlvbnMge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLkRFQlVHX0RFRkFVTFQgPSBmYWxzZTtcbiAgICB0aGlzLk5FVFdPUktfVElNRU9VVF9ERUZBVUxUID0gbnVsbDtcbiAgICB0aGlzLlNVQ0NFU1NfUkVTUE9OU0VTX0RFRkFVTFQgPSAvXjB8KFsxMjNdXFxkXFxkKXwoNDBbMTQ1NjddKXw0MTAkLztcblxuICAgIHRoaXMuaW5pdGlhbGlzZSgpO1xuICB9XG5cbiAgaW5pdGlhbGlzZShuZXdPcHRpb25zKSB7XG4gICAgbmV3T3B0aW9ucyA9IG5ld09wdGlvbnMgfHwge307XG5cbiAgICB0aGlzLl9kZWJ1ZyA9IG5ld09wdGlvbnMuZGVidWcgfHwgdGhpcy5ERUJVR19ERUZBVUxUO1xuICAgIHRoaXMuX25ldHdvcmtUaW1lb3V0U2Vjb25kcyA9XG4gICAgICBuZXdPcHRpb25zLm5ldHdvcmtUaW1lb3V0U2Vjb25kcyB8fCB0aGlzLk5FVFdPUktfVElNRU9VVF9ERUZBVUxUO1xuICAgIHRoaXMuX3N1Y2Nlc3NSZXNwb25zZXMgPVxuICAgICAgbmV3T3B0aW9ucy5zdWNjZXNzUmVzcG9uc2VzIHx8IHRoaXMuU1VDQ0VTU19SRVNQT05TRVNfREVGQVVMVDtcbiAgICB0aGlzLl9jYWNoZSA9IG5ld09wdGlvbnMuY2FjaGUgP1xuICAgICAgbmV3IENhY2hlT3B0aW9ucyhuZXdPcHRpb25zLmNhY2hlKSA6IG5ldyBDYWNoZU9wdGlvbnMoKTtcbiAgfVxuXG4gIGdldCBkZWJ1ZygpIHtcbiAgICByZXR1cm4gdGhpcy5fZGVidWc7XG4gIH1cblxuICBzZXQgZGVidWcoZGVidWdWYWx1ZSkge1xuICAgIGlmICh0eXBlb2YgZGVidWdWYWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ29wdGlvbnMuZGVidWcgbXVzdCBiZSBhIHRydWUgb3IgZmFsc2UgYm9vbGVhbi4gJyArXG4gICAgICAgICdJZ25vcmluZyBuZXcgdmFsdWU6ICcgKyBkZWJ1Z1ZhbHVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9kZWJ1ZyA9IGRlYnVnVmFsdWU7XG4gIH1cblxuICBnZXQgbmV0d29ya1RpbWVvdXRTZWNvbmRzKCkge1xuICAgIHJldHVybiB0aGlzLl9uZXR3b3JrVGltZW91dFNlY29uZHM7XG4gIH1cblxuICBzZXQgbmV0d29ya1RpbWVvdXRTZWNvbmRzKHRpbWVvdXRTZWNzKSB7XG4gICAgaWYgKHRpbWVvdXRTZWNzICE9PSBudWxsICYmIHR5cGVvZiB0aW1lb3V0U2VjcyAhPT0gJ251bWJlcicpIHtcbiAgICAgIGNvbnNvbGUud2Fybignb3B0aW9ucy5uZXR3b3JrVGltZW91dFNlY29uZHMgbXVzdCBiZSBhIGEgbnVtYmVyICcgK1xuICAgICAgICAnb3IgbnVsbC4gSWdub3JpbmcgbmV3IHZhbHVlOiAnICsgdGltZW91dFNlY3MpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX25ldHdvcmtUaW1lb3V0U2Vjb25kcyA9IHRpbWVvdXRTZWNzO1xuICB9XG5cbiAgZ2V0IGNhY2hlKCkge1xuICAgIHJldHVybiB0aGlzLl9jYWNoZTtcbiAgfVxuXG4gIHNldCBjYWNoZShuZXdDYWNoZSkge1xuICAgIHRoaXMuX2NhY2hlID0gbmV3IENhY2hlT3B0aW9ucyhuZXdDYWNoZSk7XG4gIH1cblxuICAvLyBBIHJlZ3VsYXIgZXhwcmVzc2lvbiB0byBhcHBseSB0byBIVFRQIHJlc3BvbnNlIGNvZGVzLiBDb2RlcyB0aGF0IG1hdGNoXG4gIC8vIHdpbGwgYmUgY29uc2lkZXJlZCBzdWNjZXNzZXMsIHdoaWxlIG90aGVycyB3aWxsIG5vdCwgYW5kIHdpbGwgbm90IGJlXG4gIC8vIGNhY2hlZC5cbiAgZ2V0IHN1Y2Nlc3NSZXNwb25zZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3N1Y2Nlc3NSZXNwb25zZXM7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBuZXcgR2xvYmFsT3B0aW9ucygpO1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4vbG9nZ2VyLmpzJyk7XG5jb25zdCBnbG9iYWxPcHRpb25zID0gcmVxdWlyZSgnLi4vZ2xvYmFsLW9wdGlvbnMnKTtcbmNvbnN0IGlkYkNhY2hlRXhwaXJhdGlvbiA9IHJlcXVpcmUoJy4uL2lkYi1jYWNoZS1leHBpcmF0aW9uJyk7XG5cbmxldCBjbGVhbnVwUXVldWU7XG5cbmZ1bmN0aW9uIHJlbmFtZUNhY2hlKHNvdXJjZSwgZGVzdGluYXRpb24pIHtcbiAgbG9nZ2VyLmRlYnVnKCdSZW5hbWluZyBjYWNoZTogWycgKyBzb3VyY2UgKyAnXSB0byBbJyArIGRlc3RpbmF0aW9uICsgJ10nKTtcbiAgcmV0dXJuIGNhY2hlcy5kZWxldGUoZGVzdGluYXRpb24pLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgIGNhY2hlcy5vcGVuKHNvdXJjZSksXG4gICAgICBjYWNoZXMub3BlbihkZXN0aW5hdGlvbilcbiAgICBdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdHMpIHtcbiAgICAgIHZhciBzb3VyY2VDYWNoZSA9IHJlc3VsdHNbMF07XG4gICAgICB2YXIgZGVzdENhY2hlID0gcmVzdWx0c1sxXTtcblxuICAgICAgcmV0dXJuIHNvdXJjZUNhY2hlLmtleXMoKS50aGVuKGZ1bmN0aW9uKHJlcXVlc3RzKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChyZXF1ZXN0cy5tYXAoZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICAgIHJldHVybiBzb3VyY2VDYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZGVzdENhY2hlLnB1dChyZXF1ZXN0LCByZXNwb25zZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBjYWNoZXMuZGVsZXRlKHNvdXJjZSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNsZWFudXBDYWNoZShyZXF1ZXN0LCBjYWNoZSkge1xuICB2YXIgcmVxdWVzdFVybCA9IHJlcXVlc3QudXJsO1xuICB2YXIgbWF4QWdlU2Vjb25kcyA9IGdsb2JhbE9wdGlvbnMuY2FjaGUubWF4QWdlU2Vjb25kcztcbiAgdmFyIG1heEVudHJpZXMgPSBnbG9iYWxPcHRpb25zLmNhY2hlLm1heEVudHJpZXM7XG4gIHZhciBjYWNoZU5hbWUgPSBnbG9iYWxPcHRpb25zLmNhY2hlLm5hbWU7XG5cbiAgdmFyIG5vdyA9IERhdGUubm93KCk7XG4gIGxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgTFJVIG9yZGVyIGZvciAnICsgcmVxdWVzdFVybCArICcuIE1heCBlbnRyaWVzIGlzICcgK1xuICAgIG1heEVudHJpZXMgKyAnLCBtYXggYWdlIGlzICcgKyBtYXhBZ2VTZWNvbmRzKTtcblxuICByZXR1cm4gaWRiQ2FjaGVFeHBpcmF0aW9uLmdldERiKGNhY2hlTmFtZSkudGhlbihmdW5jdGlvbihkYikge1xuICAgIHJldHVybiBpZGJDYWNoZUV4cGlyYXRpb24uc2V0VGltZXN0YW1wRm9yVXJsKGRiLCByZXF1ZXN0VXJsLCBub3cpO1xuICB9KS50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgcmV0dXJuIGlkYkNhY2hlRXhwaXJhdGlvbi5leHBpcmVFbnRyaWVzKGRiLCBtYXhFbnRyaWVzLCBtYXhBZ2VTZWNvbmRzLCBub3cpO1xuICB9KS50aGVuKGZ1bmN0aW9uKHVybHNUb0RlbGV0ZSkge1xuICAgIGxvZ2dlci5kZWJ1ZygnU3VjY2Vzc2Z1bGx5IHVwZGF0ZWQgSURCLicpO1xuXG4gICAgdmFyIGRlbGV0aW9uUHJvbWlzZXMgPSB1cmxzVG9EZWxldGUubWFwKGZ1bmN0aW9uKHVybFRvRGVsZXRlKSB7XG4gICAgICByZXR1cm4gY2FjaGUuZGVsZXRlKHVybFRvRGVsZXRlKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGlvblByb21pc2VzKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdEb25lIHdpdGggY2FjaGUgY2xlYW51cC4nKTtcbiAgICB9KTtcbiAgfSkuY2F0Y2goZnVuY3Rpb24oZXJyb3IpIHtcbiAgICBsb2dnZXIuZGVidWcoZXJyb3IpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcXVldWVDYWNoZUV4cGlyYXRpb24ocmVxdWVzdCwgY2FjaGUpIHtcbiAgdmFyIGNsZWFudXAgPSBjbGVhbnVwQ2FjaGUuYmluZChudWxsLCByZXF1ZXN0LCBjYWNoZSk7XG5cbiAgaWYgKGNsZWFudXBRdWV1ZSkge1xuICAgIGNsZWFudXBRdWV1ZSA9IGNsZWFudXBRdWV1ZS50aGVuKGNsZWFudXApO1xuICB9IGVsc2Uge1xuICAgIGNsZWFudXBRdWV1ZSA9IGNsZWFudXAoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmZXRjaEFuZENhY2hlKHJlcXVlc3QpIHtcbiAgY29uc3Qgc3VjY2Vzc1Jlc3BvbnNlcyA9IGdsb2JhbE9wdGlvbnMuc3VjY2Vzc1Jlc3BvbnNlcztcblxuICByZXR1cm4gZmV0Y2gocmVxdWVzdC5jbG9uZSgpKVxuICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgIC8vIE9ubHkgY2FjaGUgR0VUIHJlcXVlc3RzIHdpdGggc3VjY2Vzc2Z1bCByZXNwb25zZXMuXG4gICAgLy8gU2luY2UgdGhpcyBpcyBub3QgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiwgaXQgd2lsbCBiZSBkb25lXG4gICAgLy8gYXN5bmNocm9ub3VzbHkgYW5kIHdpbGwgbm90IGJsb2NrIHRoZSByZXNwb25zZSBmcm9tIGJlaW5nIHJldHVybmVkIHRvIHRoZVxuICAgIC8vIHBhZ2UuXG4gICAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyAmJiBzdWNjZXNzUmVzcG9uc2VzLnRlc3QocmVzcG9uc2Uuc3RhdHVzKSkge1xuICAgICAgY2FjaGVzLm9wZW4oZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lKVxuICAgICAgLnRoZW4oY2FjaGUgPT4ge1xuICAgICAgICByZXR1cm4gY2FjaGUucHV0KHJlcXVlc3QsIHJlc3BvbnNlKVxuICAgICAgICAudGhlbihjYWNoZSA9PiB7XG4gICAgICAgICAgLy8gT25seSBydW4gdGhlIGNhY2hlIGV4cGlyYXRpb24gbG9naWMgaWYgYXQgbGVhc3Qgb25lIG9mIHRoZSBtYXhpbXVtc1xuICAgICAgICAgIC8vIGlzIHNldCwgYW5kIGlmIHdlIGhhdmUgYSBuYW1lIGZvciB0aGUgY2FjaGUgdGhhdCB0aGUgb3B0aW9ucyBhcmVcbiAgICAgICAgICAvLyBiZWluZyBhcHBsaWVkIHRvLlxuICAgICAgICAgIC8vIFRPRE86IFRoZSBjYWNoZSBzaG91bGQgYWx3YXlzIGhhdmUgYSBuYW1lLCB3aGVuIHdvdWxkbid0IGl0P1xuICAgICAgICAgIGlmICgoZ2xvYmFsT3B0aW9ucy5jYWNoZS5tYXhFbnRyaWVzIHx8XG4gICAgICAgICAgICAgIGdsb2JhbE9wdGlvbnMuY2FjaGUubWF4QWdlU2Vjb25kcykgJiZcbiAgICAgICAgICAgICAgZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lKSB7XG4gICAgICAgICAgICBxdWV1ZUNhY2hlRXhwaXJhdGlvbihyZXF1ZXN0LCBjYWNoZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXNwb25zZS5jbG9uZSgpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlbmFtZUNhY2hlOiByZW5hbWVDYWNoZSxcbiAgZmV0Y2hBbmRDYWNoZTogZmV0Y2hBbmRDYWNoZVxufTtcbiIsIi8qXG5cdENvcHlyaWdodCAyMDE1IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cblx0TGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcblx0eW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuXHRZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cblx0VW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuXHRkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG5cdFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuXHRTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG5cdGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBnbG9iYWxPcHRpb25zID0gcmVxdWlyZSgnLi4vZ2xvYmFsLW9wdGlvbnMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlYnVnOiBmdW5jdGlvbihtZXNzYWdlLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGZsYWcgPSBvcHRpb25zLmRlYnVnIHx8IGdsb2JhbE9wdGlvbnMuZGVidWc7XG4gICAgaWYgKGZsYWcpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdbc3ctdG9vbGJveF0gJyArIG1lc3NhZ2UpO1xuICAgIH1cbiAgfVxufTtcbiIsIi8qXG4gQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgREJfUFJFRklYID0gJ3N3LXRvb2xib3gtJztcbnZhciBEQl9WRVJTSU9OID0gMTtcbnZhciBTVE9SRV9OQU1FID0gJ3N0b3JlJztcbnZhciBVUkxfUFJPUEVSVFkgPSAndXJsJztcbnZhciBUSU1FU1RBTVBfUFJPUEVSVFkgPSAndGltZXN0YW1wJztcbnZhciBjYWNoZU5hbWVUb0RiUHJvbWlzZSA9IHt9O1xuXG5mdW5jdGlvbiBvcGVuRGIoY2FjaGVOYW1lKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgcmVxdWVzdCA9IGluZGV4ZWREQi5vcGVuKERCX1BSRUZJWCArIGNhY2hlTmFtZSwgREJfVkVSU0lPTik7XG5cbiAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iamVjdFN0b3JlID0gcmVxdWVzdC5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoU1RPUkVfTkFNRSxcbiAgICAgICAgICB7a2V5UGF0aDogVVJMX1BST1BFUlRZfSk7XG4gICAgICBvYmplY3RTdG9yZS5jcmVhdGVJbmRleChUSU1FU1RBTVBfUFJPUEVSVFksIFRJTUVTVEFNUF9QUk9QRVJUWSxcbiAgICAgICAgICB7dW5pcXVlOiBmYWxzZX0pO1xuICAgIH07XG5cbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgfTtcblxuICAgIHJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXREYihjYWNoZU5hbWUpIHtcbiAgaWYgKCEoY2FjaGVOYW1lIGluIGNhY2hlTmFtZVRvRGJQcm9taXNlKSkge1xuICAgIGNhY2hlTmFtZVRvRGJQcm9taXNlW2NhY2hlTmFtZV0gPSBvcGVuRGIoY2FjaGVOYW1lKTtcbiAgfVxuXG4gIHJldHVybiBjYWNoZU5hbWVUb0RiUHJvbWlzZVtjYWNoZU5hbWVdO1xufVxuXG5mdW5jdGlvbiBzZXRUaW1lc3RhbXBGb3JVcmwoZGIsIHVybCwgbm93KSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJhbnNhY3Rpb24gPSBkYi50cmFuc2FjdGlvbihTVE9SRV9OQU1FLCAncmVhZHdyaXRlJyk7XG4gICAgdmFyIG9iamVjdFN0b3JlID0gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoU1RPUkVfTkFNRSk7XG4gICAgb2JqZWN0U3RvcmUucHV0KHt1cmw6IHVybCwgdGltZXN0YW1wOiBub3d9KTtcblxuICAgIHRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlc29sdmUoZGIpO1xuICAgIH07XG5cbiAgICB0cmFuc2FjdGlvbi5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgICByZWplY3QodHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBleHBpcmVPbGRFbnRyaWVzKGRiLCBtYXhBZ2VTZWNvbmRzLCBub3cpIHtcbiAgLy8gQmFpbCBvdXQgZWFybHkgYnkgcmVzb2x2aW5nIHdpdGggYW4gZW1wdHkgYXJyYXkgaWYgd2UncmUgbm90IHVzaW5nXG4gIC8vIG1heEFnZVNlY29uZHMuXG4gIGlmICghbWF4QWdlU2Vjb25kcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciBtYXhBZ2VNaWxsaXMgPSBtYXhBZ2VTZWNvbmRzICogMTAwMDtcbiAgICB2YXIgdXJscyA9IFtdO1xuXG4gICAgdmFyIHRyYW5zYWN0aW9uID0gZGIudHJhbnNhY3Rpb24oU1RPUkVfTkFNRSwgJ3JlYWR3cml0ZScpO1xuICAgIHZhciBvYmplY3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKFNUT1JFX05BTUUpO1xuICAgIHZhciBpbmRleCA9IG9iamVjdFN0b3JlLmluZGV4KFRJTUVTVEFNUF9QUk9QRVJUWSk7XG5cbiAgICBpbmRleC5vcGVuQ3Vyc29yKCkub25zdWNjZXNzID0gZnVuY3Rpb24oY3Vyc29yRXZlbnQpIHtcbiAgICAgIHZhciBjdXJzb3IgPSBjdXJzb3JFdmVudC50YXJnZXQucmVzdWx0O1xuICAgICAgaWYgKGN1cnNvcikge1xuICAgICAgICBpZiAobm93IC0gbWF4QWdlTWlsbGlzID4gY3Vyc29yLnZhbHVlW1RJTUVTVEFNUF9QUk9QRVJUWV0pIHtcbiAgICAgICAgICB2YXIgdXJsID0gY3Vyc29yLnZhbHVlW1VSTF9QUk9QRVJUWV07XG4gICAgICAgICAgdXJscy5wdXNoKHVybCk7XG4gICAgICAgICAgb2JqZWN0U3RvcmUuZGVsZXRlKHVybCk7XG4gICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmVzb2x2ZSh1cmxzKTtcbiAgICB9O1xuXG4gICAgdHJhbnNhY3Rpb24ub25hYm9ydCA9IHJlamVjdDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGV4cGlyZUV4dHJhRW50cmllcyhkYiwgbWF4RW50cmllcykge1xuICAvLyBCYWlsIG91dCBlYXJseSBieSByZXNvbHZpbmcgd2l0aCBhbiBlbXB0eSBhcnJheSBpZiB3ZSdyZSBub3QgdXNpbmdcbiAgLy8gbWF4RW50cmllcy5cbiAgaWYgKCFtYXhFbnRyaWVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHVybHMgPSBbXTtcblxuICAgIHZhciB0cmFuc2FjdGlvbiA9IGRiLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsICdyZWFkd3JpdGUnKTtcbiAgICB2YXIgb2JqZWN0U3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZShTVE9SRV9OQU1FKTtcbiAgICB2YXIgaW5kZXggPSBvYmplY3RTdG9yZS5pbmRleChUSU1FU1RBTVBfUFJPUEVSVFkpO1xuXG4gICAgdmFyIGNvdW50UmVxdWVzdCA9IGluZGV4LmNvdW50KCk7XG4gICAgaW5kZXguY291bnQoKS5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBpbml0aWFsQ291bnQgPSBjb3VudFJlcXVlc3QucmVzdWx0O1xuXG4gICAgICBpZiAoaW5pdGlhbENvdW50ID4gbWF4RW50cmllcykge1xuICAgICAgICBpbmRleC5vcGVuQ3Vyc29yKCkub25zdWNjZXNzID0gZnVuY3Rpb24oY3Vyc29yRXZlbnQpIHtcbiAgICAgICAgICB2YXIgY3Vyc29yID0gY3Vyc29yRXZlbnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgICAgICBpZiAoY3Vyc29yKSB7XG4gICAgICAgICAgICB2YXIgdXJsID0gY3Vyc29yLnZhbHVlW1VSTF9QUk9QRVJUWV07XG4gICAgICAgICAgICB1cmxzLnB1c2godXJsKTtcbiAgICAgICAgICAgIG9iamVjdFN0b3JlLmRlbGV0ZSh1cmwpO1xuICAgICAgICAgICAgaWYgKGluaXRpYWxDb3VudCAtIHVybHMubGVuZ3RoID4gbWF4RW50cmllcykge1xuICAgICAgICAgICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlc29sdmUodXJscyk7XG4gICAgfTtcblxuICAgIHRyYW5zYWN0aW9uLm9uYWJvcnQgPSByZWplY3Q7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBleHBpcmVFbnRyaWVzKGRiLCBtYXhFbnRyaWVzLCBtYXhBZ2VTZWNvbmRzLCBub3cpIHtcbiAgcmV0dXJuIGV4cGlyZU9sZEVudHJpZXMoZGIsIG1heEFnZVNlY29uZHMsIG5vdykudGhlbihmdW5jdGlvbihvbGRVcmxzKSB7XG4gICAgcmV0dXJuIGV4cGlyZUV4dHJhRW50cmllcyhkYiwgbWF4RW50cmllcykudGhlbihmdW5jdGlvbihleHRyYVVybHMpIHtcbiAgICAgIHJldHVybiBvbGRVcmxzLmNvbmNhdChleHRyYVVybHMpO1xuICAgIH0pO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldERiOiBnZXREYixcbiAgc2V0VGltZXN0YW1wRm9yVXJsOiBzZXRUaW1lc3RhbXBGb3JVcmwsXG4gIGV4cGlyZUVudHJpZXM6IGV4cGlyZUVudHJpZXNcbn07XG4iLCIvKlxuICBDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG4gIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG4ndXNlIHN0cmljdCc7XG5cbi8vIFRPRE86IFVzZSBzZWxmLnJlZ2lzdHJhdGlvbi5zY29wZSBpbnN0ZWFkIG9mIHNlbGYubG9jYXRpb25cbnZhciB1cmwgPSBuZXcgVVJMKCcuLycsIHNlbGYubG9jYXRpb24pO1xudmFyIGJhc2VQYXRoID0gdXJsLnBhdGhuYW1lO1xudmFyIHBhdGhSZWdleHAgPSByZXF1aXJlKCdwYXRoLXRvLXJlZ2V4cCcpO1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihtZXRob2QsIHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgaWYgKHBhdGggaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICB0aGlzLmZ1bGxVcmxSZWdFeHAgPSBwYXRoO1xuICB9IGVsc2Uge1xuICAgIC8vIFRoZSBVUkwoKSBjb25zdHJ1Y3RvciBjYW4ndCBwYXJzZSBleHByZXNzLXN0eWxlIHJvdXRlcyBhcyB0aGV5IGFyZSBub3RcbiAgICAvLyB2YWxpZCB1cmxzLiBUaGlzIG1lYW5zIHdlIGhhdmUgdG8gbWFudWFsbHkgbWFuaXB1bGF0ZSByZWxhdGl2ZSB1cmxzIGludG9cbiAgICAvLyBhYnNvbHV0ZSBvbmVzLiBUaGlzIGNoZWNrIGlzIGV4dHJlbWVseSBuYWl2ZSBidXQgaW1wbGVtZW50aW5nIGEgdHdlYWtlZFxuICAgIC8vIHZlcnNpb24gb2YgdGhlIGZ1bGwgYWxnb3JpdGhtIHNlZW1zIGxpa2Ugb3ZlcmtpbGxcbiAgICAvLyAoaHR0cHM6Ly91cmwuc3BlYy53aGF0d2cub3JnLyNjb25jZXB0LWJhc2ljLXVybC1wYXJzZXIpXG4gICAgaWYgKHBhdGguaW5kZXhPZignLycpICE9PSAwKSB7XG4gICAgICBwYXRoID0gYmFzZVBhdGggKyBwYXRoO1xuICAgIH1cblxuICAgIHRoaXMua2V5cyA9IFtdO1xuICAgIHRoaXMucmVnZXhwID0gcGF0aFJlZ2V4cChwYXRoLCB0aGlzLmtleXMpO1xuICB9XG5cbiAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIHRoaXMuaGFuZGxlciA9IGhhbmRsZXI7XG59O1xuXG5Sb3V0ZS5wcm90b3R5cGUubWFrZUhhbmRsZXIgPSBmdW5jdGlvbih1cmwpIHtcbiAgdmFyIHZhbHVlcztcbiAgaWYgKHRoaXMucmVnZXhwKSB7XG4gICAgdmFyIG1hdGNoID0gdGhpcy5yZWdleHAuZXhlYyh1cmwpO1xuICAgIHZhbHVlcyA9IHt9O1xuICAgIHRoaXMua2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgaW5kZXgpIHtcbiAgICAgIHZhbHVlc1trZXkubmFtZV0gPSBtYXRjaFtpbmRleCArIDFdO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVyKHJlcXVlc3QsIHZhbHVlcywgdGhpcy5vcHRpb25zKTtcbiAgfS5iaW5kKHRoaXMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZTtcbiIsIi8qXG4gIENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIFJvdXRlID0gcmVxdWlyZSgnLi9yb3V0ZScpO1xuXG5mdW5jdGlvbiByZWdleEVzY2FwZShzKSB7XG4gIHJldHVybiBzLnJlcGxhY2UoL1stXFwvXFxcXF4kKis/LigpfFtcXF17fV0vZywgJ1xcXFwkJicpO1xufVxuXG52YXIga2V5TWF0Y2ggPSBmdW5jdGlvbihtYXAsIHN0cmluZykge1xuICAvLyBUaGlzIHdvdWxkIGJlIGJldHRlciB3cml0dGVuIGFzIGEgZm9yLi5vZiBsb29wLCBidXQgdGhhdCB3b3VsZCBicmVhayB0aGVcbiAgLy8gbWluaWZ5aWZ5IHByb2Nlc3MgaW4gdGhlIGJ1aWxkLlxuICB2YXIgZW50cmllc0l0ZXJhdG9yID0gbWFwLmVudHJpZXMoKTtcbiAgdmFyIGl0ZW0gPSBlbnRyaWVzSXRlcmF0b3IubmV4dCgpO1xuICB2YXIgbWF0Y2hlcyA9IFtdO1xuICB3aGlsZSAoIWl0ZW0uZG9uZSkge1xuICAgIHZhciBwYXR0ZXJuID0gbmV3IFJlZ0V4cChpdGVtLnZhbHVlWzBdKTtcbiAgICBpZiAocGF0dGVybi50ZXN0KHN0cmluZykpIHtcbiAgICAgIG1hdGNoZXMucHVzaChpdGVtLnZhbHVlWzFdKTtcbiAgICB9XG4gICAgaXRlbSA9IGVudHJpZXNJdGVyYXRvci5uZXh0KCk7XG4gIH1cbiAgcmV0dXJuIG1hdGNoZXM7XG59O1xuXG52YXIgUm91dGVyID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMucm91dGVzID0gbmV3IE1hcCgpO1xuICAvLyBDcmVhdGUgdGhlIGR1bW15IG9yaWdpbiBmb3IgUmVnRXhwLWJhc2VkIHJvdXRlc1xuICB0aGlzLnJvdXRlcy5zZXQoUmVnRXhwLCBuZXcgTWFwKCkpO1xuICB0aGlzLmRlZmF1bHQgPSBudWxsO1xufTtcblxuWydnZXQnLCAncG9zdCcsICdwdXQnLCAnZGVsZXRlJywgJ2hlYWQnLCAnYW55J10uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcbiAgUm91dGVyLnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24ocGF0aCwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIHJldHVybiB0aGlzLmFkZChtZXRob2QsIHBhdGgsIGhhbmRsZXIsIG9wdGlvbnMpO1xuICB9O1xufSk7XG5cblJvdXRlci5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24obWV0aG9kLCBwYXRoLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgb3JpZ2luO1xuXG4gIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgLy8gV2UgbmVlZCBhIHVuaXF1ZSBrZXkgdG8gdXNlIGluIHRoZSBNYXAgdG8gZGlzdGluZ3Vpc2ggUmVnRXhwIHBhdGhzXG4gICAgLy8gZnJvbSBFeHByZXNzLXN0eWxlIHBhdGhzICsgb3JpZ2lucy4gU2luY2Ugd2UgY2FuIHVzZSBhbnkgb2JqZWN0IGFzIHRoZVxuICAgIC8vIGtleSBpbiBhIE1hcCwgbGV0J3MgdXNlIHRoZSBSZWdFeHAgY29uc3RydWN0b3IhXG4gICAgb3JpZ2luID0gUmVnRXhwO1xuICB9IGVsc2Uge1xuICAgIG9yaWdpbiA9IG9wdGlvbnMub3JpZ2luIHx8IHNlbGYubG9jYXRpb24ub3JpZ2luO1xuICAgIGlmIChvcmlnaW4gaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIG9yaWdpbiA9IG9yaWdpbi5zb3VyY2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9yaWdpbiA9IHJlZ2V4RXNjYXBlKG9yaWdpbik7XG4gICAgfVxuICB9XG5cbiAgbWV0aG9kID0gbWV0aG9kLnRvTG93ZXJDYXNlKCk7XG5cbiAgdmFyIHJvdXRlID0gbmV3IFJvdXRlKG1ldGhvZCwgcGF0aCwgaGFuZGxlciwgb3B0aW9ucyk7XG5cbiAgaWYgKCF0aGlzLnJvdXRlcy5oYXMob3JpZ2luKSkge1xuICAgIHRoaXMucm91dGVzLnNldChvcmlnaW4sIG5ldyBNYXAoKSk7XG4gIH1cblxuICB2YXIgbWV0aG9kTWFwID0gdGhpcy5yb3V0ZXMuZ2V0KG9yaWdpbik7XG4gIGlmICghbWV0aG9kTWFwLmhhcyhtZXRob2QpKSB7XG4gICAgbWV0aG9kTWFwLnNldChtZXRob2QsIG5ldyBNYXAoKSk7XG4gIH1cblxuICB2YXIgcm91dGVNYXAgPSBtZXRob2RNYXAuZ2V0KG1ldGhvZCk7XG4gIHZhciByZWdFeHAgPSByb3V0ZS5yZWdleHAgfHwgcm91dGUuZnVsbFVybFJlZ0V4cDtcbiAgcm91dGVNYXAuc2V0KHJlZ0V4cC5zb3VyY2UsIHJvdXRlKTtcbn07XG5cblJvdXRlci5wcm90b3R5cGUubWF0Y2hNZXRob2QgPSBmdW5jdGlvbihtZXRob2QsIHVybCkge1xuICB2YXIgdXJsT2JqZWN0ID0gbmV3IFVSTCh1cmwpO1xuICB2YXIgb3JpZ2luID0gdXJsT2JqZWN0Lm9yaWdpbjtcbiAgdmFyIHBhdGggPSB1cmxPYmplY3QucGF0aG5hbWU7XG5cbiAgLy8gV2Ugd2FudCB0byBmaXJzdCBjaGVjayB0byBzZWUgaWYgdGhlcmUncyBhIG1hdGNoIGFnYWluc3QgYW55XG4gIC8vIFwiRXhwcmVzcy1zdHlsZVwiIHJvdXRlcyAoc3RyaW5nIGZvciB0aGUgcGF0aCwgUmVnRXhwIGZvciB0aGUgb3JpZ2luKS5cbiAgLy8gQ2hlY2tpbmcgZm9yIEV4cHJlc3Mtc3R5bGUgbWF0Y2hlcyBmaXJzdCBtYWludGFpbnMgdGhlIGxlZ2FjeSBiZWhhdmlvci5cbiAgLy8gSWYgdGhlcmUncyBubyBtYXRjaCwgd2UgbmV4dCBjaGVjayBmb3IgYSBtYXRjaCBhZ2FpbnN0IGFueSBSZWdFeHAgcm91dGVzLFxuICAvLyB3aGVyZSB0aGUgUmVnRXhwIGluIHF1ZXN0aW9uIG1hdGNoZXMgdGhlIGZ1bGwgVVJMIChib3RoIG9yaWdpbiBhbmQgcGF0aCkuXG4gIHJldHVybiB0aGlzLl9tYXRjaChtZXRob2QsIGtleU1hdGNoKHRoaXMucm91dGVzLCBvcmlnaW4pLCBwYXRoKSB8fFxuICAgIHRoaXMuX21hdGNoKG1ldGhvZCwgW3RoaXMucm91dGVzLmdldChSZWdFeHApXSwgdXJsKTtcbn07XG5cblJvdXRlci5wcm90b3R5cGUuX21hdGNoID0gZnVuY3Rpb24obWV0aG9kLCBtZXRob2RNYXBzLCBwYXRoT3JVcmwpIHtcbiAgaWYgKG1ldGhvZE1hcHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IG1ldGhvZE1hcHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbWV0aG9kTWFwID0gbWV0aG9kTWFwc1tpXTtcbiAgICB2YXIgcm91dGVNYXAgPSBtZXRob2RNYXAgJiYgbWV0aG9kTWFwLmdldChtZXRob2QudG9Mb3dlckNhc2UoKSk7XG4gICAgaWYgKHJvdXRlTWFwKSB7XG4gICAgICB2YXIgcm91dGVzID0ga2V5TWF0Y2gocm91dGVNYXAsIHBhdGhPclVybCk7XG4gICAgICBpZiAocm91dGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlc1swXS5tYWtlSGFuZGxlcihwYXRoT3JVcmwpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufTtcblxuUm91dGVyLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAgcmV0dXJuIHRoaXMubWF0Y2hNZXRob2QocmVxdWVzdC5tZXRob2QsIHJlcXVlc3QudXJsKSB8fFxuICAgICAgdGhpcy5tYXRjaE1ldGhvZCgnYW55JywgcmVxdWVzdC51cmwpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBuZXcgUm91dGVyKCk7XG4iLCIvKlxuXHRDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG5cdExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG5cdHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cblx0WW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5cdFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcblx0ZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuXHRXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblx0U2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuXHRsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG5cbid1c2Ugc3RyaWN0JztcblxuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vaGVscGVycy9sb2dnZXInKTtcbmNvbnN0IGNhY2hlSGVscGVycyA9IHJlcXVpcmUoJy4uL2hlbHBlcnMvY2FjaGUnKTtcbmNvbnN0IGdsb2JhbE9wdGlvbnMgPSByZXF1aXJlKCcuLi9nbG9iYWwtb3B0aW9ucycpO1xuXG5mdW5jdGlvbiBjYWNoZUZpcnN0KHJlcXVlc3QsIHZhbHVlcykge1xuICBsb2dnZXIuZGVidWcoJ1N0cmF0ZWd5OiBjYWNoZSBmaXJzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nKTtcbiAgcmV0dXJuIGNhY2hlcy5vcGVuKGdsb2JhbE9wdGlvbnMuY2FjaGUubmFtZSlcbiAgLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcbiAgICByZXR1cm4gY2FjaGUubWF0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNhY2hlSGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QpO1xuICAgIH0pO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZUZpcnN0O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uL2hlbHBlcnMvbG9nZ2VyJyk7XG5jb25zdCBjYWNoZUhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzL2NhY2hlJyk7XG5jb25zdCBnbG9iYWxPcHRpb25zID0gcmVxdWlyZSgnLi4vZ2xvYmFsLW9wdGlvbnMnKTtcblxuZnVuY3Rpb24gY2FjaGVPbmx5KHJlcXVlc3QsIHZhbHVlcykge1xuICBsb2dnZXIuZGVidWcoJ1N0cmF0ZWd5OiBjYWNoZSBvbmx5IFsnICsgcmVxdWVzdC51cmwgKyAnXScpO1xuICByZXR1cm4gY2FjaGVzLm9wZW4oZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lKVxuICAudGhlbihmdW5jdGlvbihjYWNoZSkge1xuICAgIHJldHVybiBjYWNoZS5tYXRjaChyZXF1ZXN0KTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY2FjaGVPbmx5O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uL2hlbHBlcnMvbG9nZ2VyJyk7XG5jb25zdCBjYWNoZUhlbHBlcnMgPSByZXF1aXJlKCcuLi9oZWxwZXJzL2NhY2hlJyk7XG5jb25zdCBjYWNoZU9ubHkgPSByZXF1aXJlKCcuL2NhY2hlT25seScpO1xuXG5mdW5jdGlvbiBmYXN0ZXN0KHJlcXVlc3QsIHZhbHVlcykge1xuICBsb2dnZXIuZGVidWcoJ1N0cmF0ZWd5OiBmYXN0ZXN0IFsnICsgcmVxdWVzdC51cmwgKyAnXScpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgcmVqZWN0ZWQgPSBmYWxzZTtcbiAgICB2YXIgcmVhc29ucyA9IFtdO1xuXG4gICAgdmFyIG1heWJlUmVqZWN0ID0gZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICByZWFzb25zLnB1c2gocmVhc29uLnRvU3RyaW5nKCkpO1xuICAgICAgaWYgKHJlamVjdGVkKSB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ0JvdGggY2FjaGUgYW5kIG5ldHdvcmsgZmFpbGVkOiBcIicgK1xuICAgICAgICAgICAgcmVhc29ucy5qb2luKCdcIiwgXCInKSArICdcIicpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIG1heWJlUmVzb2x2ZSA9IGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJlc3BvbnNlKSB7XG4gICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1heWJlUmVqZWN0KCdObyByZXN1bHQgcmV0dXJuZWQnKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY2FjaGVIZWxwZXJzLmZldGNoQW5kQ2FjaGUocmVxdWVzdC5jbG9uZSgpKVxuICAgICAgLnRoZW4obWF5YmVSZXNvbHZlLCBtYXliZVJlamVjdCk7XG5cbiAgICBjYWNoZU9ubHkocmVxdWVzdCwgdmFsdWVzKVxuICAgICAgLnRoZW4obWF5YmVSZXNvbHZlLCBtYXliZVJlamVjdCk7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZhc3Rlc3Q7XG4iLCIvKlxuXHRDb3B5cmlnaHQgMjAxNCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuXG5cdExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG5cdHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cblx0WW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG5cdFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcblx0ZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuXHRXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cblx0U2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuXHRsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmV0d29ya09ubHk6IHJlcXVpcmUoJy4vbmV0d29ya09ubHknKSxcbiAgbmV0d29ya0ZpcnN0OiByZXF1aXJlKCcuL25ldHdvcmtGaXJzdCcpLFxuICBjYWNoZU9ubHk6IHJlcXVpcmUoJy4vY2FjaGVPbmx5JyksXG4gIGNhY2hlRmlyc3Q6IHJlcXVpcmUoJy4vY2FjaGVGaXJzdCcpLFxuICBmYXN0ZXN0OiByZXF1aXJlKCcuL2Zhc3Rlc3QnKVxufTtcbiIsIi8qXG5cdENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cblx0TGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcblx0eW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuXHRZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cblx0VW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuXHRkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG5cdFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuXHRTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG5cdGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi9oZWxwZXJzL2xvZ2dlcicpO1xuY29uc3QgY2FjaGVIZWxwZXJzID0gcmVxdWlyZSgnLi4vaGVscGVycy9jYWNoZScpO1xuY29uc3QgZ2xvYmFsT3B0aW9ucyA9IHJlcXVpcmUoJy4uL2dsb2JhbC1vcHRpb25zJyk7XG5cbmZ1bmN0aW9uIG5ldHdvcmtGaXJzdChyZXF1ZXN0LCB2YWx1ZXMsIG9wdGlvbnMpIHtcbiAgbG9nZ2VyLmRlYnVnKCdTdHJhdGVneTogbmV0d29yayBmaXJzdCBbJyArIHJlcXVlc3QudXJsICsgJ10nLCBvcHRpb25zKTtcblxuICByZXR1cm4gY2FjaGVzLm9wZW4oZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lKVxuICAudGhlbihmdW5jdGlvbihjYWNoZSkge1xuICAgIHZhciB0aW1lb3V0SWQ7XG4gICAgdmFyIHByb21pc2VzID0gW107XG4gICAgdmFyIG9yaWdpbmFsUmVzcG9uc2U7XG5cbiAgICBpZiAoZ2xvYmFsT3B0aW9ucy5jYWNoZS5uZXR3b3JrVGltZW91dFNlY29uZHMpIHtcbiAgICAgIHZhciBjYWNoZVdoZW5UaW1lZE91dFByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FjaGUubWF0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgIC8vIE9ubHkgcmVzb2x2ZSB0aGlzIHByb21pc2UgaWYgdGhlcmUncyBhIHZhbGlkIHJlc3BvbnNlIGluIHRoZVxuICAgICAgICAgICAgICAvLyBjYWNoZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2Ugd29uJ3QgdGltZSBvdXQgYSBuZXR3b3JrIHJlcXVlc3RcbiAgICAgICAgICAgICAgLy8gdW5sZXNzIHRoZXJlJ3MgYSBjYWNoZWQgZW50cnkgdG8gZmFsbGJhY2sgb24sIHdoaWNoIGlzIGFyZ3VhYmx5XG4gICAgICAgICAgICAgIC8vIHRoZSBwcmVmZXJhYmxlIGJlaGF2aW9yLlxuICAgICAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZ2xvYmFsT3B0aW9ucy5jYWNoZS5uZXR3b3JrVGltZW91dFNlY29uZHMgKiAxMDAwKTtcbiAgICAgIH0pO1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZVdoZW5UaW1lZE91dFByb21pc2UpO1xuICAgIH1cblxuICAgIHZhciBuZXR3b3JrUHJvbWlzZSA9IGNhY2hlSGVscGVycy5mZXRjaEFuZENhY2hlKHJlcXVlc3QsIG9wdGlvbnMpXG4gICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAvLyBXZSd2ZSBnb3QgYSByZXNwb25zZSwgc28gY2xlYXIgdGhlIG5ldHdvcmsgdGltZW91dCBpZiB0aGVyZSBpcyBvbmUuXG4gICAgICAgIGlmICh0aW1lb3V0SWQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChnbG9iYWxPcHRpb25zLnN1Y2Nlc3NSZXNwb25zZXMudGVzdChyZXNwb25zZS5zdGF0dXMpKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9XG5cbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdSZXNwb25zZSB3YXMgYW4gSFRUUCBlcnJvcjogJyArIHJlc3BvbnNlLnN0YXR1c1RleHQsXG4gICAgICAgICAgICBvcHRpb25zKTtcbiAgICAgICAgb3JpZ2luYWxSZXNwb25zZSA9IHJlc3BvbnNlO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhZCByZXNwb25zZScpO1xuICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdOZXR3b3JrIG9yIHJlc3BvbnNlIGVycm9yLCBmYWxsYmFjayB0byBjYWNoZSBbJyArXG4gICAgICAgICAgICByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBjYWNoZS5tYXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgLy8gSWYgdGhlcmUncyBhIG1hdGNoIGluIHRoZSBjYWNoZSwgcmVzb2x2ZSB3aXRoIHRoYXQuXG4gICAgICAgICAgaWYgKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhIFJlc3BvbnNlIG9iamVjdCBmcm9tIHRoZSBwcmV2aW91cyBmZXRjaCwgdGhlbiByZXNvbHZlXG4gICAgICAgICAgLy8gd2l0aCB0aGF0LCBldmVuIHRob3VnaCBpdCBjb3JyZXNwb25kcyB0byBhbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICAgICAgICBpZiAob3JpZ2luYWxSZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsUmVzcG9uc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgd2UgZG9uJ3QgaGF2ZSBhIFJlc3BvbnNlIG9iamVjdCBmcm9tIHRoZSBwcmV2aW91cyBmZXRjaCwgbGlrZWx5XG4gICAgICAgICAgLy8gZHVlIHRvIGEgbmV0d29yayBmYWlsdXJlLCB0aGVuIHJlamVjdCB3aXRoIHRoZSBmYWlsdXJlIGVycm9yLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgcHJvbWlzZXMucHVzaChuZXR3b3JrUHJvbWlzZSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yYWNlKHByb21pc2VzKTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbmV0d29ya0ZpcnN0O1xuIiwiLypcblx0Q29weXJpZ2h0IDIwMTQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cblxuXHRMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuXHR5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG5cdFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuXHRVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG5cdGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcblx0V0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG5cdFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcblx0bGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uL2hlbHBlcnMvbG9nZ2VyJyk7XG5cbmZ1bmN0aW9uIG5ldHdvcmtPbmx5KHJlcXVlc3QsIHZhbHVlcywgb3B0aW9ucykge1xuICBsb2dnZXIuZGVidWcoJ1N0cmF0ZWd5OiBuZXR3b3JrIG9ubHkgWycgKyByZXF1ZXN0LnVybCArICddJywgb3B0aW9ucyk7XG4gIHJldHVybiBmZXRjaChyZXF1ZXN0KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBuZXR3b3JrT25seTtcbiIsIi8qXG4gIENvcHlyaWdodCAyMDE0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuKi9cbid1c2Ugc3RyaWN0JztcblxuLy8gV2Ugc2hvdWxkIHN0aWxsIHVzZSB0aGlzIHRvIHBvbHlmaWxsIHRoZSBzdHJpY3RlciBjYWNoZS5hZGQgYW5kXG4vLyBjYWNoZS5hZGRBbGwuIFJlbW92ZSB3aGVuIENocm9tZSB2ZXJzaW9uIDUwIGFuZCBGRiB2ZXJzaW9uIDQ2IGFyZVxuLy8gdGhlIG5vcm0gYXMgdGhlc2UgaGF2ZSB0aGUgY29ycmVjdCBiZWhhdmlvdXJcbnJlcXVpcmUoJ3NlcnZpY2V3b3JrZXItY2FjaGUtcG9seWZpbGwnKTtcblxuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi9oZWxwZXJzL2xvZ2dlci5qcycpO1xuY29uc3QgY2FjaGVIZWxwZXIgPSByZXF1aXJlKCcuL2hlbHBlcnMvY2FjaGUuanMnKTtcbmNvbnN0IGdsb2JhbE9wdGlvbnMgPSByZXF1aXJlKCcuL2dsb2JhbC1vcHRpb25zLmpzJyk7XG5jb25zdCByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xuY29uc3Qgc3RyYXRlZ2llcyA9IHJlcXVpcmUoJy4vc3RyYXRlZ2llcycpO1xuXG5jbGFzcyBTV1Rvb2xib3gge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBsb2dnZXIuZGVidWcoJ1NlcnZpY2UgV29ya2VyIFRvb2xib3ggaXMgbG9hZGluZycpO1xuXG4gICAgdGhpcy5yb3V0ZXIgPSByb3V0ZXI7XG4gICAgT2JqZWN0LmtleXMoc3RyYXRlZ2llcykuZm9yRWFjaChzdHJhdGVneU5hbWUgPT4ge1xuICAgICAgdGhpc1tzdHJhdGVneU5hbWVdID0gc3RyYXRlZ2llc1tzdHJhdGVneU5hbWVdO1xuICAgIH0pO1xuXG4gICAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdmZXRjaCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gcm91dGVyLm1hdGNoKGV2ZW50LnJlcXVlc3QpO1xuXG4gICAgICBpZiAoaGFuZGxlcikge1xuICAgICAgICBldmVudC5yZXNwb25kV2l0aChoYW5kbGVyKGV2ZW50LnJlcXVlc3QpKTtcbiAgICAgIH0gZWxzZSBpZiAocm91dGVyLmRlZmF1bHQgJiYgZXZlbnQucmVxdWVzdC5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgICAgIGV2ZW50LnJlc3BvbmRXaXRoKHJvdXRlci5kZWZhdWx0KGV2ZW50LnJlcXVlc3QpKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGdldCBvcHRpb25zKCkge1xuICAgIHJldHVybiBnbG9iYWxPcHRpb25zO1xuICB9XG5cbiAgc2V0IG9wdGlvbnMobmV3T3B0aW9ucykge1xuICAgIGdsb2JhbE9wdGlvbnMuaW5pdGlhbGlzZShuZXdPcHRpb25zKTtcbiAgfVxuXG4gIF92YWxpZGF0ZVByZWNhY2hlSW5wdXQoaXRlbXMpIHtcbiAgICB2YXIgaXNWYWxpZCA9IEFycmF5LmlzQXJyYXkoaXRlbXMpO1xuICAgIGlmIChpc1ZhbGlkKSB7XG4gICAgICBpdGVtcy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgaWYgKCEodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnIHx8IChpdGVtIGluc3RhbmNlb2YgUmVxdWVzdCkpKSB7XG4gICAgICAgICAgaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIF92YWxpZGF0ZVByZWNhY2hlTWFuaWZlc3RJbnB1dChtYW5pZmVzdCkge1xuICAgIHZhciBpc1ZhbGlkID0gQXJyYXkuaXNBcnJheShtYW5pZmVzdCk7XG4gICAgaWYgKGlzVmFsaWQpIHtcbiAgICAgIG1hbmlmZXN0LmZvckVhY2gobWFuaWZlc3RFbnRyeSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbWFuaWZlc3RFbnRyeS51cmwgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgICAgbWFuaWZlc3RFbnRyeS51cmwgaW5zdGFuY2VvZiBTdHJpbmcgfHxcbiAgICAgICAgICBtYW5pZmVzdEVudHJ5LnVybC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBpc1ZhbGlkID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG1hbmlmZXN0RW50cnkuZmlsZVJldmlzaW9uID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICAgIG1hbmlmZXN0RW50cnkuZmlsZVJldmlzaW9uIGluc3RhbmNlb2YgU3RyaW5nIHx8XG4gICAgICAgICAgbWFuaWZlc3RFbnRyeS5maWxlUmV2aXNpb24ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgaXNWYWxpZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1RoZSBwcmVjYWNoZUZyb21NYW5pZmVzdCBtZXRob2QgZXhwZWN0cyBlaXRoZXIgYW4gJyArXG4gICAgICAnYXJyYXkgb2Ygc3RyaW5ncyBhbmQvb3IgUmVxdWVzdHMgb3IgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gJyArXG4gICAgICAnYXJyYXkgb2Ygc3RyaW5ncyBhbmQvb3IgUmVxdWVzdHMuJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hbmlmZXN0O1xuICB9XG5cbiAgcHJlY2FjaGUoaXRlbXMpIHtcbiAgICBpZiAoIShpdGVtcyBpbnN0YW5jZW9mIFByb21pc2UpICYmICF0aGlzLl92YWxpZGF0ZVByZWNhY2hlSW5wdXQoaXRlbXMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdUaGUgcHJlY2FjaGUgbWV0aG9kIGV4cGVjdHMgZWl0aGVyIGFuIGFycmF5IG9mICcgK1xuICAgICAgJ3N0cmluZ3MgYW5kL29yIFJlcXVlc3RzIG9yIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mICcgK1xuICAgICAgJ3N0cmluZ3MgYW5kL29yIFJlcXVlc3RzLicpO1xuICAgIH1cblxuICAgIC8vIEVpdGhlciBQcm9taXNlIG9mIHZhbGlkXG4gICAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZXZlbnQgPT4ge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdpbnN0YWxsIGV2ZW50IGZpcmVkJyk7XG5cbiAgICAgIGNvbnN0IGluYWN0aXZlQ2FjaGVOYW1lID0gZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lICsgJyQkJGluYWN0aXZlJCQkJztcbiAgICAgIGxvZ2dlci5kZWJ1ZygnY3JlYXRpbmcgY2FjaGUgWycgKyBpbmFjdGl2ZUNhY2hlTmFtZSArICddJyk7XG5cbiAgICAgIGV2ZW50LndhaXRVbnRpbChcbiAgICAgICAgY2FjaGVzLm9wZW4oaW5hY3RpdmVDYWNoZU5hbWUpXG4gICAgICAgIC50aGVuKGNhY2hlID0+IHtcbiAgICAgICAgICBsZXQgcHJvbWlzZUNoYWluID0gUHJvbWlzZS5yZXNvbHZlKGl0ZW1zKTtcbiAgICAgICAgICBpZiAoaXRlbXMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICBwcm9taXNlQ2hhaW4gPSBpdGVtcztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcHJvbWlzZUNoYWluXG4gICAgICAgICAgLnRoZW4ocHJlY2FjaGVJdGVtcyA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlUHJlY2FjaGVJbnB1dChwcmVjYWNoZUl0ZW1zKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdUaGUgcHJlY2FjaGUgbWV0aG9kIGV4cGVjdHMgZWl0aGVyIGFuICcgK1xuICAgICAgICAgICAgICAnYXJyYXkgb2Ygc3RyaW5ncyBhbmQvb3IgUmVxdWVzdHMgb3IgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgJyArXG4gICAgICAgICAgICAgICd0byBhbiBhcnJheSBvZiBzdHJpbmdzIGFuZC9vciBSZXF1ZXN0cy4nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKCdwcmVDYWNoZSBsaXN0OiAnICtcbiAgICAgICAgICAgICAgKHByZWNhY2hlSXRlbXMuam9pbignLCAnKSB8fCAnKG5vbmUpJykpO1xuXG4gICAgICAgICAgICByZXR1cm4gY2FjaGUuYWRkQWxsKHByZWNhY2hlSXRlbXMpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIHNlbGYuYWRkRXZlbnRMaXN0ZW5lcignYWN0aXZhdGUnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdhY3RpdmF0ZSBldmVudCBmaXJlZCcpO1xuICAgICAgY29uc3QgaW5hY3RpdmVDYWNoZU5hbWUgPSBnbG9iYWxPcHRpb25zLmNhY2hlLm5hbWUgKyAnJCQkaW5hY3RpdmUkJCQnO1xuICAgICAgZXZlbnQud2FpdFVudGlsKFxuICAgICAgICBjYWNoZUhlbHBlci5yZW5hbWVDYWNoZShpbmFjdGl2ZUNhY2hlTmFtZSwgZ2xvYmFsT3B0aW9ucy5jYWNoZS5uYW1lKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByZWNhY2hlRnJvbU1hbmlmZXN0KG1hbmlmZXN0KSB7XG4gICAgaWYgKCEobWFuaWZlc3QgaW5zdGFuY2VvZiBQcm9taXNlKSkge1xuICAgICAgdGhpcy5fdmFsaWRhdGVQcmVjYWNoZU1hbmlmZXN0SW5wdXQobWFuaWZlc3QpO1xuICAgIH1cbiAgfVxuXG4gIGNhY2hlKHVybCkge1xuICAgIHJldHVybiBjYWNoZXMub3BlbihnbG9iYWxPcHRpb25zKVxuICAgIC50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgICByZXR1cm4gY2FjaGUuYWRkKHVybCk7XG4gICAgfSk7XG4gIH1cblxuICB1bmNhY2hlKHVybCkge1xuICAgIHJldHVybiBjYWNoZXMub3BlbihnbG9iYWxPcHRpb25zKVxuICAgIC50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XG4gICAgICByZXR1cm4gY2FjaGUuZGVsZXRlKHVybCk7XG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBuZXcgU1dUb29sYm94KCk7XG4iLCJ2YXIgaXNhcnJheSA9IHJlcXVpcmUoJ2lzYXJyYXknKVxuXG4vKipcbiAqIEV4cG9zZSBgcGF0aFRvUmVnZXhwYC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBwYXRoVG9SZWdleHBcbm1vZHVsZS5leHBvcnRzLnBhcnNlID0gcGFyc2Vcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGUgPSBjb21waWxlXG5tb2R1bGUuZXhwb3J0cy50b2tlbnNUb0Z1bmN0aW9uID0gdG9rZW5zVG9GdW5jdGlvblxubW9kdWxlLmV4cG9ydHMudG9rZW5zVG9SZWdFeHAgPSB0b2tlbnNUb1JlZ0V4cFxuXG4vKipcbiAqIFRoZSBtYWluIHBhdGggbWF0Y2hpbmcgcmVnZXhwIHV0aWxpdHkuXG4gKlxuICogQHR5cGUge1JlZ0V4cH1cbiAqL1xudmFyIFBBVEhfUkVHRVhQID0gbmV3IFJlZ0V4cChbXG4gIC8vIE1hdGNoIGVzY2FwZWQgY2hhcmFjdGVycyB0aGF0IHdvdWxkIG90aGVyd2lzZSBhcHBlYXIgaW4gZnV0dXJlIG1hdGNoZXMuXG4gIC8vIFRoaXMgYWxsb3dzIHRoZSB1c2VyIHRvIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCB3b24ndCB0cmFuc2Zvcm0uXG4gICcoXFxcXFxcXFwuKScsXG4gIC8vIE1hdGNoIEV4cHJlc3Mtc3R5bGUgcGFyYW1ldGVycyBhbmQgdW4tbmFtZWQgcGFyYW1ldGVycyB3aXRoIGEgcHJlZml4XG4gIC8vIGFuZCBvcHRpb25hbCBzdWZmaXhlcy4gTWF0Y2hlcyBhcHBlYXIgYXM6XG4gIC8vXG4gIC8vIFwiLzp0ZXN0KFxcXFxkKyk/XCIgPT4gW1wiL1wiLCBcInRlc3RcIiwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgXCI/XCIsIHVuZGVmaW5lZF1cbiAgLy8gXCIvcm91dGUoXFxcXGQrKVwiICA9PiBbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXVxuICAvLyBcIi8qXCIgICAgICAgICAgICA9PiBbXCIvXCIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCIqXCJdXG4gICcoW1xcXFwvLl0pPyg/Oig/OlxcXFw6KFxcXFx3KykoPzpcXFxcKCgoPzpcXFxcXFxcXC58W14oKV0pKylcXFxcKSk/fFxcXFwoKCg/OlxcXFxcXFxcLnxbXigpXSkrKVxcXFwpKShbKyo/XSk/fChcXFxcKikpJ1xuXS5qb2luKCd8JyksICdnJylcblxuLyoqXG4gKiBQYXJzZSBhIHN0cmluZyBmb3IgdGhlIHJhdyB0b2tlbnMuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5mdW5jdGlvbiBwYXJzZSAoc3RyKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICB2YXIga2V5ID0gMFxuICB2YXIgaW5kZXggPSAwXG4gIHZhciBwYXRoID0gJydcbiAgdmFyIHJlc1xuXG4gIHdoaWxlICgocmVzID0gUEFUSF9SRUdFWFAuZXhlYyhzdHIpKSAhPSBudWxsKSB7XG4gICAgdmFyIG0gPSByZXNbMF1cbiAgICB2YXIgZXNjYXBlZCA9IHJlc1sxXVxuICAgIHZhciBvZmZzZXQgPSByZXMuaW5kZXhcbiAgICBwYXRoICs9IHN0ci5zbGljZShpbmRleCwgb2Zmc2V0KVxuICAgIGluZGV4ID0gb2Zmc2V0ICsgbS5sZW5ndGhcblxuICAgIC8vIElnbm9yZSBhbHJlYWR5IGVzY2FwZWQgc2VxdWVuY2VzLlxuICAgIGlmIChlc2NhcGVkKSB7XG4gICAgICBwYXRoICs9IGVzY2FwZWRbMV1cbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuXG4gICAgLy8gUHVzaCB0aGUgY3VycmVudCBwYXRoIG9udG8gdGhlIHRva2Vucy5cbiAgICBpZiAocGF0aCkge1xuICAgICAgdG9rZW5zLnB1c2gocGF0aClcbiAgICAgIHBhdGggPSAnJ1xuICAgIH1cblxuICAgIHZhciBwcmVmaXggPSByZXNbMl1cbiAgICB2YXIgbmFtZSA9IHJlc1szXVxuICAgIHZhciBjYXB0dXJlID0gcmVzWzRdXG4gICAgdmFyIGdyb3VwID0gcmVzWzVdXG4gICAgdmFyIHN1ZmZpeCA9IHJlc1s2XVxuICAgIHZhciBhc3RlcmlzayA9IHJlc1s3XVxuXG4gICAgdmFyIHJlcGVhdCA9IHN1ZmZpeCA9PT0gJysnIHx8IHN1ZmZpeCA9PT0gJyonXG4gICAgdmFyIG9wdGlvbmFsID0gc3VmZml4ID09PSAnPycgfHwgc3VmZml4ID09PSAnKidcbiAgICB2YXIgZGVsaW1pdGVyID0gcHJlZml4IHx8ICcvJ1xuICAgIHZhciBwYXR0ZXJuID0gY2FwdHVyZSB8fCBncm91cCB8fCAoYXN0ZXJpc2sgPyAnLionIDogJ1teJyArIGRlbGltaXRlciArICddKz8nKVxuXG4gICAgdG9rZW5zLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSB8fCBrZXkrKyxcbiAgICAgIHByZWZpeDogcHJlZml4IHx8ICcnLFxuICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICBvcHRpb25hbDogb3B0aW9uYWwsXG4gICAgICByZXBlYXQ6IHJlcGVhdCxcbiAgICAgIHBhdHRlcm46IGVzY2FwZUdyb3VwKHBhdHRlcm4pXG4gICAgfSlcbiAgfVxuXG4gIC8vIE1hdGNoIGFueSBjaGFyYWN0ZXJzIHN0aWxsIHJlbWFpbmluZy5cbiAgaWYgKGluZGV4IDwgc3RyLmxlbmd0aCkge1xuICAgIHBhdGggKz0gc3RyLnN1YnN0cihpbmRleClcbiAgfVxuXG4gIC8vIElmIHRoZSBwYXRoIGV4aXN0cywgcHVzaCBpdCBvbnRvIHRoZSBlbmQuXG4gIGlmIChwYXRoKSB7XG4gICAgdG9rZW5zLnB1c2gocGF0aClcbiAgfVxuXG4gIHJldHVybiB0b2tlbnNcbn1cblxuLyoqXG4gKiBDb21waWxlIGEgc3RyaW5nIHRvIGEgdGVtcGxhdGUgZnVuY3Rpb24gZm9yIHRoZSBwYXRoLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gICBzdHJcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICovXG5mdW5jdGlvbiBjb21waWxlIChzdHIpIHtcbiAgcmV0dXJuIHRva2Vuc1RvRnVuY3Rpb24ocGFyc2Uoc3RyKSlcbn1cblxuLyoqXG4gKiBFeHBvc2UgYSBtZXRob2QgZm9yIHRyYW5zZm9ybWluZyB0b2tlbnMgaW50byB0aGUgcGF0aCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gdG9rZW5zVG9GdW5jdGlvbiAodG9rZW5zKSB7XG4gIC8vIENvbXBpbGUgYWxsIHRoZSB0b2tlbnMgaW50byByZWdleHBzLlxuICB2YXIgbWF0Y2hlcyA9IG5ldyBBcnJheSh0b2tlbnMubGVuZ3RoKVxuXG4gIC8vIENvbXBpbGUgYWxsIHRoZSBwYXR0ZXJucyBiZWZvcmUgY29tcGlsYXRpb24uXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gPT09ICdvYmplY3QnKSB7XG4gICAgICBtYXRjaGVzW2ldID0gbmV3IFJlZ0V4cCgnXicgKyB0b2tlbnNbaV0ucGF0dGVybiArICckJylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBwYXRoID0gJydcbiAgICB2YXIgZGF0YSA9IG9iaiB8fCB7fVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgICBpZiAodHlwZW9mIHRva2VuID09PSAnc3RyaW5nJykge1xuICAgICAgICBwYXRoICs9IHRva2VuXG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgdmFyIHZhbHVlID0gZGF0YVt0b2tlbi5uYW1lXVxuICAgICAgdmFyIHNlZ21lbnRcblxuICAgICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIGJlIGRlZmluZWQnKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc2FycmF5KHZhbHVlKSkge1xuICAgICAgICBpZiAoIXRva2VuLnJlcGVhdCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IHJlcGVhdCwgYnV0IHJlY2VpdmVkIFwiJyArIHZhbHVlICsgJ1wiJylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBpZiAodG9rZW4ub3B0aW9uYWwpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIFwiJyArIHRva2VuLm5hbWUgKyAnXCIgdG8gbm90IGJlIGVtcHR5JylcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHZhbHVlLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgc2VnbWVudCA9IGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZVtqXSlcblxuICAgICAgICAgIGlmICghbWF0Y2hlc1tpXS50ZXN0KHNlZ21lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbGwgXCInICsgdG9rZW4ubmFtZSArICdcIiB0byBtYXRjaCBcIicgKyB0b2tlbi5wYXR0ZXJuICsgJ1wiLCBidXQgcmVjZWl2ZWQgXCInICsgc2VnbWVudCArICdcIicpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGF0aCArPSAoaiA9PT0gMCA/IHRva2VuLnByZWZpeCA6IHRva2VuLmRlbGltaXRlcikgKyBzZWdtZW50XG4gICAgICAgIH1cblxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBzZWdtZW50ID0gZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKVxuXG4gICAgICBpZiAoIW1hdGNoZXNbaV0udGVzdChzZWdtZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBcIicgKyB0b2tlbi5uYW1lICsgJ1wiIHRvIG1hdGNoIFwiJyArIHRva2VuLnBhdHRlcm4gKyAnXCIsIGJ1dCByZWNlaXZlZCBcIicgKyBzZWdtZW50ICsgJ1wiJylcbiAgICAgIH1cblxuICAgICAgcGF0aCArPSB0b2tlbi5wcmVmaXggKyBzZWdtZW50XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGhcbiAgfVxufVxuXG4vKipcbiAqIEVzY2FwZSBhIHJlZ3VsYXIgZXhwcmVzc2lvbiBzdHJpbmcuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZXNjYXBlU3RyaW5nIChzdHIpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oWy4rKj89XiE6JHt9KClbXFxdfFxcL10pL2csICdcXFxcJDEnKVxufVxuXG4vKipcbiAqIEVzY2FwZSB0aGUgY2FwdHVyaW5nIGdyb3VwIGJ5IGVzY2FwaW5nIHNwZWNpYWwgY2hhcmFjdGVycyBhbmQgbWVhbmluZy5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGdyb3VwXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGVzY2FwZUdyb3VwIChncm91cCkge1xuICByZXR1cm4gZ3JvdXAucmVwbGFjZSgvKFs9ITokXFwvKCldKS9nLCAnXFxcXCQxJylcbn1cblxuLyoqXG4gKiBBdHRhY2ggdGhlIGtleXMgYXMgYSBwcm9wZXJ0eSBvZiB0aGUgcmVnZXhwLlxuICpcbiAqIEBwYXJhbSAge1JlZ0V4cH0gcmVcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiBhdHRhY2hLZXlzIChyZSwga2V5cykge1xuICByZS5rZXlzID0ga2V5c1xuICByZXR1cm4gcmVcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGZsYWdzIGZvciBhIHJlZ2V4cCBmcm9tIHRoZSBvcHRpb25zLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBmbGFncyAob3B0aW9ucykge1xuICByZXR1cm4gb3B0aW9ucy5zZW5zaXRpdmUgPyAnJyA6ICdpJ1xufVxuXG4vKipcbiAqIFB1bGwgb3V0IGtleXMgZnJvbSBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtSZWdFeHB9IHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiByZWdleHBUb1JlZ2V4cCAocGF0aCwga2V5cykge1xuICAvLyBVc2UgYSBuZWdhdGl2ZSBsb29rYWhlYWQgdG8gbWF0Y2ggb25seSBjYXB0dXJpbmcgZ3JvdXBzLlxuICB2YXIgZ3JvdXBzID0gcGF0aC5zb3VyY2UubWF0Y2goL1xcKCg/IVxcPykvZylcblxuICBpZiAoZ3JvdXBzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBncm91cHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGksXG4gICAgICAgIHByZWZpeDogbnVsbCxcbiAgICAgICAgZGVsaW1pdGVyOiBudWxsLFxuICAgICAgICBvcHRpb25hbDogZmFsc2UsXG4gICAgICAgIHJlcGVhdDogZmFsc2UsXG4gICAgICAgIHBhdHRlcm46IG51bGxcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocGF0aCwga2V5cylcbn1cblxuLyoqXG4gKiBUcmFuc2Zvcm0gYW4gYXJyYXkgaW50byBhIHJlZ2V4cC5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIGFycmF5VG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHBhcnRzID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJ0cy5wdXNoKHBhdGhUb1JlZ2V4cChwYXRoW2ldLCBrZXlzLCBvcHRpb25zKS5zb3VyY2UpXG4gIH1cblxuICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cCgnKD86JyArIHBhcnRzLmpvaW4oJ3wnKSArICcpJywgZmxhZ3Mob3B0aW9ucykpXG5cbiAgcmV0dXJuIGF0dGFjaEtleXMocmVnZXhwLCBrZXlzKVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHBhdGggcmVnZXhwIGZyb20gc3RyaW5nIGlucHV0LlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICBrZXlzXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xuZnVuY3Rpb24gc3RyaW5nVG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgdmFyIHRva2VucyA9IHBhcnNlKHBhdGgpXG4gIHZhciByZSA9IHRva2Vuc1RvUmVnRXhwKHRva2Vucywgb3B0aW9ucylcblxuICAvLyBBdHRhY2gga2V5cyBiYWNrIHRvIHRoZSByZWdleHAuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbnNbaV0gIT09ICdzdHJpbmcnKSB7XG4gICAgICBrZXlzLnB1c2godG9rZW5zW2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdHRhY2hLZXlzKHJlLCBrZXlzKVxufVxuXG4vKipcbiAqIEV4cG9zZSBhIGZ1bmN0aW9uIGZvciB0YWtpbmcgdG9rZW5zIGFuZCByZXR1cm5pbmcgYSBSZWdFeHAuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICB0b2tlbnNcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHBhcmFtICB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHRva2Vuc1RvUmVnRXhwICh0b2tlbnMsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cblxuICB2YXIgc3RyaWN0ID0gb3B0aW9ucy5zdHJpY3RcbiAgdmFyIGVuZCA9IG9wdGlvbnMuZW5kICE9PSBmYWxzZVxuICB2YXIgcm91dGUgPSAnJ1xuICB2YXIgbGFzdFRva2VuID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXVxuICB2YXIgZW5kc1dpdGhTbGFzaCA9IHR5cGVvZiBsYXN0VG9rZW4gPT09ICdzdHJpbmcnICYmIC9cXC8kLy50ZXN0KGxhc3RUb2tlbilcblxuICAvLyBJdGVyYXRlIG92ZXIgdGhlIHRva2VucyBhbmQgY3JlYXRlIG91ciByZWdleHAgc3RyaW5nLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXVxuXG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJvdXRlICs9IGVzY2FwZVN0cmluZyh0b2tlbilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHByZWZpeCA9IGVzY2FwZVN0cmluZyh0b2tlbi5wcmVmaXgpXG4gICAgICB2YXIgY2FwdHVyZSA9IHRva2VuLnBhdHRlcm5cblxuICAgICAgaWYgKHRva2VuLnJlcGVhdCkge1xuICAgICAgICBjYXB0dXJlICs9ICcoPzonICsgcHJlZml4ICsgY2FwdHVyZSArICcpKidcbiAgICAgIH1cblxuICAgICAgaWYgKHRva2VuLm9wdGlvbmFsKSB7XG4gICAgICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgICBjYXB0dXJlID0gJyg/OicgKyBwcmVmaXggKyAnKCcgKyBjYXB0dXJlICsgJykpPydcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYXB0dXJlID0gJygnICsgY2FwdHVyZSArICcpPydcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FwdHVyZSA9IHByZWZpeCArICcoJyArIGNhcHR1cmUgKyAnKSdcbiAgICAgIH1cblxuICAgICAgcm91dGUgKz0gY2FwdHVyZVxuICAgIH1cbiAgfVxuXG4gIC8vIEluIG5vbi1zdHJpY3QgbW9kZSB3ZSBhbGxvdyBhIHNsYXNoIGF0IHRoZSBlbmQgb2YgbWF0Y2guIElmIHRoZSBwYXRoIHRvXG4gIC8vIG1hdGNoIGFscmVhZHkgZW5kcyB3aXRoIGEgc2xhc2gsIHdlIHJlbW92ZSBpdCBmb3IgY29uc2lzdGVuY3kuIFRoZSBzbGFzaFxuICAvLyBpcyB2YWxpZCBhdCB0aGUgZW5kIG9mIGEgcGF0aCBtYXRjaCwgbm90IGluIHRoZSBtaWRkbGUuIFRoaXMgaXMgaW1wb3J0YW50XG4gIC8vIGluIG5vbi1lbmRpbmcgbW9kZSwgd2hlcmUgXCIvdGVzdC9cIiBzaG91bGRuJ3QgbWF0Y2ggXCIvdGVzdC8vcm91dGVcIi5cbiAgaWYgKCFzdHJpY3QpIHtcbiAgICByb3V0ZSA9IChlbmRzV2l0aFNsYXNoID8gcm91dGUuc2xpY2UoMCwgLTIpIDogcm91dGUpICsgJyg/OlxcXFwvKD89JCkpPydcbiAgfVxuXG4gIGlmIChlbmQpIHtcbiAgICByb3V0ZSArPSAnJCdcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiBub24tZW5kaW5nIG1vZGUsIHdlIG5lZWQgdGhlIGNhcHR1cmluZyBncm91cHMgdG8gbWF0Y2ggYXMgbXVjaCBhc1xuICAgIC8vIHBvc3NpYmxlIGJ5IHVzaW5nIGEgcG9zaXRpdmUgbG9va2FoZWFkIHRvIHRoZSBlbmQgb3IgbmV4dCBwYXRoIHNlZ21lbnQuXG4gICAgcm91dGUgKz0gc3RyaWN0ICYmIGVuZHNXaXRoU2xhc2ggPyAnJyA6ICcoPz1cXFxcL3wkKSdcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJvdXRlLCBmbGFncyhvcHRpb25zKSlcbn1cblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLCByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgY2FuIGJlIHBhc3NlZCBpbiBmb3IgdGhlIGtleXMsIHdoaWNoIHdpbGwgaG9sZCB0aGVcbiAqIHBsYWNlaG9sZGVyIGtleSBkZXNjcmlwdGlvbnMuIEZvciBleGFtcGxlLCB1c2luZyBgL3VzZXIvOmlkYCwgYGtleXNgIHdpbGxcbiAqIGNvbnRhaW4gYFt7IG5hbWU6ICdpZCcsIGRlbGltaXRlcjogJy8nLCBvcHRpb25hbDogZmFsc2UsIHJlcGVhdDogZmFsc2UgfV1gLlxuICpcbiAqIEBwYXJhbSAgeyhTdHJpbmd8UmVnRXhwfEFycmF5KX0gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9ICAgICAgICAgICAgICAgICBba2V5c11cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgICAgICAgICAgW29wdGlvbnNdXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbmZ1bmN0aW9uIHBhdGhUb1JlZ2V4cCAocGF0aCwga2V5cywgb3B0aW9ucykge1xuICBrZXlzID0ga2V5cyB8fCBbXVxuXG4gIGlmICghaXNhcnJheShrZXlzKSkge1xuICAgIG9wdGlvbnMgPSBrZXlzXG4gICAga2V5cyA9IFtdXG4gIH0gZWxzZSBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge31cbiAgfVxuXG4gIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgcmV0dXJuIHJlZ2V4cFRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICBpZiAoaXNhcnJheShwYXRoKSkge1xuICAgIHJldHVybiBhcnJheVRvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMpXG4gIH1cblxuICByZXR1cm4gc3RyaW5nVG9SZWdleHAocGF0aCwga2V5cywgb3B0aW9ucylcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJyKSA9PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgR29vZ2xlIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKlxuICovXG5cbihmdW5jdGlvbigpIHtcbiAgdmFyIG5hdGl2ZUFkZEFsbCA9IENhY2hlLnByb3RvdHlwZS5hZGRBbGw7XG4gIHZhciB1c2VyQWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKC8oRmlyZWZveHxDaHJvbWUpXFwvKFxcZCtcXC4pLyk7XG5cbiAgLy8gSGFzIG5pY2UgYmVoYXZpb3Igb2YgYHZhcmAgd2hpY2ggZXZlcnlvbmUgaGF0ZXNcbiAgaWYgKHVzZXJBZ2VudCkge1xuICAgIHZhciBhZ2VudCA9IHVzZXJBZ2VudFsxXTtcbiAgICB2YXIgdmVyc2lvbiA9IHBhcnNlSW50KHVzZXJBZ2VudFsyXSk7XG4gIH1cblxuICBpZiAoXG4gICAgbmF0aXZlQWRkQWxsICYmICghdXNlckFnZW50IHx8XG4gICAgICAoYWdlbnQgPT09ICdGaXJlZm94JyAmJiB2ZXJzaW9uID49IDQ2KSB8fFxuICAgICAgKGFnZW50ID09PSAnQ2hyb21lJyAgJiYgdmVyc2lvbiA+PSA1MClcbiAgICApXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIENhY2hlLnByb3RvdHlwZS5hZGRBbGwgPSBmdW5jdGlvbiBhZGRBbGwocmVxdWVzdHMpIHtcbiAgICB2YXIgY2FjaGUgPSB0aGlzO1xuXG4gICAgLy8gU2luY2UgRE9NRXhjZXB0aW9ucyBhcmUgbm90IGNvbnN0cnVjdGFibGU6XG4gICAgZnVuY3Rpb24gTmV0d29ya0Vycm9yKG1lc3NhZ2UpIHtcbiAgICAgIHRoaXMubmFtZSA9ICdOZXR3b3JrRXJyb3InO1xuICAgICAgdGhpcy5jb2RlID0gMTk7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgIH1cblxuICAgIE5ldHdvcmtFcnJvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEVycm9yLnByb3RvdHlwZSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMSkgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuXG4gICAgICAvLyBTaW11bGF0ZSBzZXF1ZW5jZTwoUmVxdWVzdCBvciBVU1ZTdHJpbmcpPiBiaW5kaW5nOlxuICAgICAgdmFyIHNlcXVlbmNlID0gW107XG5cbiAgICAgIHJlcXVlc3RzID0gcmVxdWVzdHMubWFwKGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAgICAgICAgaWYgKHJlcXVlc3QgaW5zdGFuY2VvZiBSZXF1ZXN0KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Q7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyhyZXF1ZXN0KTsgLy8gbWF5IHRocm93IFR5cGVFcnJvclxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICByZXF1ZXN0cy5tYXAoZnVuY3Rpb24ocmVxdWVzdCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSBuZXcgUmVxdWVzdChyZXF1ZXN0KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgc2NoZW1lID0gbmV3IFVSTChyZXF1ZXN0LnVybCkucHJvdG9jb2w7XG5cbiAgICAgICAgICBpZiAoc2NoZW1lICE9PSAnaHR0cDonICYmIHNjaGVtZSAhPT0gJ2h0dHBzOicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBOZXR3b3JrRXJyb3IoXCJJbnZhbGlkIHNjaGVtZVwiKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gZmV0Y2gocmVxdWVzdC5jbG9uZSgpKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSkudGhlbihmdW5jdGlvbihyZXNwb25zZXMpIHtcbiAgICAgIC8vIElmIHNvbWUgb2YgdGhlIHJlc3BvbnNlcyBoYXMgbm90IE9LLWVpc2ggc3RhdHVzLFxuICAgICAgLy8gdGhlbiB3aG9sZSBvcGVyYXRpb24gc2hvdWxkIHJlamVjdFxuICAgICAgaWYgKHJlc3BvbnNlcy5zb21lKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgIHJldHVybiAhcmVzcG9uc2Uub2s7XG4gICAgICB9KSkge1xuICAgICAgICB0aHJvdyBuZXcgTmV0d29ya0Vycm9yKCdJbmNvcnJlY3QgcmVzcG9uc2Ugc3RhdHVzJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFRPRE86IGNoZWNrIHRoYXQgcmVxdWVzdHMgZG9uJ3Qgb3ZlcndyaXRlIG9uZSBhbm90aGVyXG4gICAgICAvLyAoZG9uJ3QgdGhpbmsgdGhpcyBpcyBwb3NzaWJsZSB0byBwb2x5ZmlsbCBkdWUgdG8gb3BhcXVlIHJlc3BvbnNlcylcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcmVzcG9uc2VzLm1hcChmdW5jdGlvbihyZXNwb25zZSwgaSkge1xuICAgICAgICAgIHJldHVybiBjYWNoZS5wdXQocmVxdWVzdHNbaV0sIHJlc3BvbnNlKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSk7XG4gIH07XG5cbiAgQ2FjaGUucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZChyZXF1ZXN0KSB7XG4gICAgcmV0dXJuIHRoaXMuYWRkQWxsKFtyZXF1ZXN0XSk7XG4gIH07XG59KCkpOyJdfQ==

//# sourceMappingURL=sw-toolbox.js.map
