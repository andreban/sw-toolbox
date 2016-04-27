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
