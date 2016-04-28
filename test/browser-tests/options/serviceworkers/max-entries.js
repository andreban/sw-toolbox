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

'use strict';

/* eslint-env worker, serviceworker */

importScripts('/sw-toolbox.js');

self.toolbox.options.debug = true;
self.toolbox.options.cache = {
  name: 'precache-valid',
  maxEntries: 2
};

self.addEventListener('install', event => {
  event.waitUntil(
    self.toolbox.cache('/test/data/files/text-1.txt')
    .then(() => {
      console.log('Cache 1 Done, cache 2 next');
      return self.toolbox.cache('/test/data/files/text-2.txt');
    })
    .then(() => {
      console.log('Cache 2 Done, cache 3 next');
      return self.toolbox.cache('/test/data/files/text-3.txt');
    })
  );
});
