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

class Options {
  constructor() {
    // Default values here
    this._debug = false;
  }

  get debug() {
    return this._debug;
  }

  set debug(debugValue) {
    if (typeof debugValue !== 'boolean') {
      throw new Error('options.debug must be a true or false boolean.');
    }

    this._debug = debugValue;
  }
}

module.exports = new Options();
