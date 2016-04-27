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
