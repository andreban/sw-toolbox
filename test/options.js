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

require('chai').should();
const expect = require('chai').expect;

describe('Test Options', () => {
  beforeEach(function() {
    delete require.cache[require.resolve('../lib/global-options.js')];
  });

  it('should manage option changes across scopes', function() {
    const options = require('../lib/global-options.js');
    options.debug.should.equal(false);

    options.debug = true;
    options.networkTimeoutSeconds = 123;
    options.cache.name = 'test-name';

    (function() {
      const newOptions = require('../lib/global-options.js');
      newOptions.debug.should.equal(true);
      newOptions.networkTimeoutSeconds.should.equal(123);
      newOptions.cache.name.should.equal('test-name');
    })();
  });

  describe('options.debug', function() {
    it('should have default value of false', () => {
      const options = require('../lib/global-options.js');
      options.debug.should.equal(false);
    });

    it('should keep track of change to true', () => {
      const options = require('../lib/global-options.js');
      options.debug = true;
      options.debug.should.equal(true);
    });

    it('should keep track of multiple changes', () => {
      const options = require('../lib/global-options.js');
      options.debug = true;
      options.debug.should.equal(true);

      options.debug = false;
      options.debug.should.equal(false);

      options.debug = true;
      options.debug.should.equal(true);
    });

    it('should ignore invalid input', () => {
      const options = require('../lib/global-options.js');
      options.debug = '';
      options.debug.should.equal(false);
    });
  });

  describe('options.networkTimeoutSeconds', function() {
    it('should have default value of null', () => {
      const options = require('../lib/global-options.js');
      expect(options.networkTimeoutSeconds).to.equal(null);
    });

    it('should keep track of change to 1', () => {
      const options = require('../lib/global-options.js');
      options.networkTimeoutSeconds = 1;
      options.networkTimeoutSeconds.should.equal(1);
    });

    it('should keep track of multiple changes', () => {
      const options = require('../lib/global-options.js');
      options.networkTimeoutSeconds = 1;
      options.networkTimeoutSeconds.should.equal(1);

      options.networkTimeoutSeconds = 2;
      options.networkTimeoutSeconds.should.equal(2);

      options.networkTimeoutSeconds = null;
      expect(options.networkTimeoutSeconds).to.equal(null);
    });

    it('should ignore invalid input', () => {
      const options = require('../lib/global-options.js');
      options.networkTimeoutSeconds = '';
      expect(options.networkTimeoutSeconds).to.equal(null);
    });
  });

  describe('options.cache', function() {
    it('should have default value (i.e. be defined)', () => {
      const options = require('../lib/global-options.js');
      expect(options.cache).to.be.defined;
    });

    it('should have default name value', () => {
      const options = require('../lib/global-options.js');
      options.cache.name.should.equal('$$$toolbox-cache$$$');
    });

    it('should have default maxAgeSeconds value of null', () => {
      const options = require('../lib/global-options.js');
      expect(options.cache.maxAgeSeconds).to.equal(null);
    });

    it('should have default maxEntries value of null', () => {
      const options = require('../lib/global-options.js');
      expect(options.cache.maxEntries).to.equal(null);
    });

    describe('options.cache.name', function() {
      it('should track name changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.name = 'test-name';
        options.cache.name.should.equal('test-name');
      });

      it('should track multiple name changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.name = 'test-name';
        options.cache.name.should.equal('test-name');

        options.cache.name = 'test-name-v2';
        options.cache.name.should.equal('test-name-v2');
      });

      it('should track name changes via new cache object and keep default values', () => {
        const options = require('../lib/global-options.js');
        options.cache = {
          name: 'test-name'
        };
        options.cache.name.should.equal('test-name');

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.name.should.equal('test-name');
          expect(options.cache.maxAgeSeconds).to.equal(null);
          expect(options.cache.maxEntries).to.equal(null);
        })();

        options.cache = {
          name: 'test-name-v2'
        };
        options.cache.name.should.equal('test-name-v2');

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.name.should.equal('test-name-v2');
          expect(options.cache.maxAgeSeconds).to.equal(null);
          expect(options.cache.maxEntries).to.equal(null);
        })();
      });

      it('should ignore invalid name changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.name = '';
        options.cache.name.should.equal('$$$toolbox-cache$$$');

        options.cache.name = null;
        options.cache.name.should.equal('$$$toolbox-cache$$$');
      });
    });

    describe('options.cache.maxAgeSeconds', function() {
      it('should track maxAgeSeconds changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxAgeSeconds = 123;
        options.cache.maxAgeSeconds.should.equal(123);
      });

      it('should track multiple maxAgeSeconds changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxAgeSeconds = 123;
        options.cache.maxAgeSeconds.should.equal(123);

        options.cache.maxAgeSeconds = 321;
        options.cache.maxAgeSeconds.should.equal(321);

        options.cache.maxAgeSeconds = null;
        expect(options.cache.maxAgeSeconds).to.equal(null);
      });

      it('should track maxAgeSeconds changes via new cache object and keep default values', () => {
        const options = require('../lib/global-options.js');
        options.cache = {
          maxAgeSeconds: 123
        };
        options.cache.maxAgeSeconds.should.equal(123);

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.maxAgeSeconds.should.equal(123);
          expect(options.cache.maxEntries).to.equal(null);
          expect(options.cache.name).to.equal('$$$toolbox-cache$$$');
        })();

        options.cache = {
          maxAgeSeconds: 321
        };
        options.cache.maxAgeSeconds.should.equal(321);

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.maxAgeSeconds.should.equal(321);
          expect(options.cache.maxEntries).to.equal(null);
          expect(options.cache.name).to.equal('$$$toolbox-cache$$$');
        })();
      });

      it('should ignore invalid name changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxAgeSeconds = 'hello';
        expect(options.cache.maxAgeSeconds).to.equal(null);

        options.cache.maxAgeSeconds = [];
        expect(options.cache.maxAgeSeconds).to.equal(null);
      });
    });

    describe('options.cache.maxEntries', function() {
      it('should track maxEntries changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxEntries = 123;
        options.cache.maxEntries.should.equal(123);
      });

      it('should track multiple maxEntries changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxEntries = 123;
        options.cache.maxEntries.should.equal(123);

        options.cache.maxEntries = 321;
        options.cache.maxEntries.should.equal(321);

        options.cache.maxEntries = null;
        expect(options.cache.maxEntries).to.equal(null);
      });

      it('should track maxEntries changes via new cache object and keep default values', () => {
        const options = require('../lib/global-options.js');
        options.cache = {
          maxEntries: 123
        };
        options.cache.maxEntries.should.equal(123);

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.maxEntries.should.equal(123);
          expect(options.cache.maxAgeSeconds).to.equal(null);
          expect(options.cache.name).to.equal('$$$toolbox-cache$$$');
        })();

        options.cache = {
          maxEntries: 321
        };
        options.cache.maxEntries.should.equal(321);

        (function() {
          const newOptions = require('../lib/global-options.js');
          newOptions.cache.maxEntries.should.equal(321);
          expect(options.cache.maxAgeSeconds).to.equal(null);
          expect(options.cache.name).to.equal('$$$toolbox-cache$$$');
        })();
      });

      it('should ignore invalid name changes', () => {
        const options = require('../lib/global-options.js');
        options.cache.maxEntries = 'hello';
        expect(options.cache.maxEntries).to.equal(null);

        options.cache.maxEntries = [];
        expect(options.cache.maxEntries).to.equal(null);
      });
    });
  });
});
