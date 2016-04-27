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

describe('Test precacheFromManifest()', () => {
  const swUtils = window.goog.WindowUtils;

  const serviceWorkersFolder = '/test/browser-tests/precacheFromManifest/serviceworkers';

  describe('Valid Manifests)', function() {

  });

  describe('Multiple precacheFromManifest() Calls', function() {

  });

  describe('precacheFromManifest() Edge Cases', function() {
    /** it('should precache all assets from precache and custom install listeners', () => {
      let toolboxAssetList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      let additionalInstallAssets = [
        '/test/data/files/text-2.txt',
        '/test/data/files/text-3.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/edgecase-custom-install.js')
        .then(() => {
          return swUtils.getAllCachedAssets('precache-custom-install-toolbox');
        })
        .then(cachedAssets => {
          return compareCachedAssets(toolboxAssetList, cachedAssets);
        })
        .then(() => {
          return swUtils.getAllCachedAssets('precache-custom-install');
        })
        .then(cachedAssets => {
          return compareCachedAssets(additionalInstallAssets, cachedAssets);
        });
    });**/
  });

  describe('precacheFromManifest() Error Cases', function() {
    it('should throw an error when caching a single string', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-single-item.js')
      .should.be.rejected;
    });

    it('should throw an error when precaching an array of promises', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-array-of-promises.js')
      .should.be.rejected;
    });

    it('should throw an error when attmpting to precache nested arrays', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-nested-arrays.js')
      .should.be.rejected;
    });

    it('should throw an error when attempting to precache nested promises', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-nested-promises.js')
      .should.be.rejected;
    });

    it('should throw an error when precaching a mix of strings, promises and arrays', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-mix.js')
      .should.be.rejected;
    });

    it('should failt to install service worker due to Promise resolving to a javascript object, not an array.', () => {
      return swUtils.activateSW(serviceWorkersFolder + '/error-non-array-promise.js')
      .should.be.rejected;
    });

    // This behaviour is undefined - discussed here:
    // https://github.com/GoogleChrome/sw-toolbox/issues/75
    /** it.skip('should not precache paths that do no exist', () => {
      let testId = 'precache-non-existant-files';
      let validAssetsList = [
        '/test/data/files/text.txt',
        '/test/data/files/text-1.txt'
      ];
      return swUtils.activateSW(serviceWorkersFolder + '/error-non-existant-files.js')
        .then(() => {
          return swUtils.getAllCachedAssets(testId);
        })
        .then(cachedAssets => {
          return compareCachedAssets(validAssetsList, cachedAssets);
        });
    });**/
  });
});
