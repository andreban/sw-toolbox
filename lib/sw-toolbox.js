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

const helpers = require('./helpers');

class SWToolbox {
  constructor() {
    helpers.debug('Service Worker Toolbox is loading');
    this.options = require('./options');
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

  precache(items) {
    if (!(items instanceof Promise) && !this._validatePrecacheInput(items)) {
      throw new TypeError('The precache method expects either an array of ' +
      'strings and/or Requests or a Promise that resolves to an array of ' +
      'strings and/or Requests.');
    }

    // Either Promise of valid
    self.addEventListener('install', event => {
      helpers.debug('install event fired');

      var inactiveCache = this.options.cache.name + '$$$inactive$$$';
      helpers.debug('creating cache [' + inactiveCache + ']');

      event.waitUntil(
        helpers.openCache({cache: {name: inactiveCache}})
        .then(function(cache) {
          return Promise.all(options.preCacheItems)
          .then(flatten)
          .then(validatePrecacheInput)
          .then(function(preCacheItems) {
            helpers.debug('preCache list: ' +
                (preCacheItems.join(', ') || '(none)'));
            return cache.addAll(preCacheItems);
          });
        })
      );
    });
  }
}

module.exports = new SWToolbox();
