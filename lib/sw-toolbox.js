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
    return caches.open(globalOptions.cache.name)
    .then(function(cache) {
      return cache.add(url);
    });
  }

  uncache(url) {
    return caches.open(globalOptions.cache.name)
    .then(function(cache) {
      return cache.delete(url);
    });
  }
}

module.exports = new SWToolbox();
