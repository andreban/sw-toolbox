/*
  Copyright 2016 Google Inc. All Rights Reserved.

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

/* eslint-env browser, mocha */

'use strict';

describe('Test precache method', () => {
  const swUtils = window.goog.WindowUtils;
  const serviceWorkersFolder = '/test/browser-tests/precache/serviceworkers';

  describe('Test precache(<Array>)', function() {
    it('should precache all desired assets from an array of strings', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-strings.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from an array of requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-requests.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });

    it('should precache all desired assets from an array of strings and requests', () => {
      let assetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/array-mix.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-valid');
        })
        .then(cachedAssets => {
          return compareCachedAssets(assetList, cachedAssets);
        });
    });
  });
});
