/*
Copyright 2024-present The maxGraph project Contributors

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
import { getElapseMillisecondsMessage } from '../internal/time-utils.js';
/**
 * A {@link Logger} that does nothing.
 *
 * @experimental subject to change or removal. The logging system may be modified in the future without prior notice.
 * @since 0.11.0
 * @category Logging
 */
export class NoOpLogger {
    debug(_message) { }
    enter(_message) {
        return undefined;
    }
    error(_message, ..._optionalParams) { }
    info(_message) { }
    leave(_message, _baseTimestamp) { }
    show() { }
    trace(_message) { }
    warn(_message) { }
}
/**
 * A {@link Logger} that directs logs to the browser console.
 *
 * @experimental subject to change or removal. The logging system may be modified in the future without prior notice.
 * @since 0.11.0
 * @category Logging
 */
export class ConsoleLogger {
    constructor() {
        this.debugEnabled = false;
        this.infoEnabled = false;
        this.traceEnabled = false;
    }
    /* eslint-disable no-console -- we must use "console" to direct logs to the browser console */
    enter(message) {
        if (this.traceEnabled) {
            console.trace(`Entering ${message}`);
            return new Date().getTime();
        }
        return undefined;
    }
    leave(message, baseTimestamp) {
        if (this.traceEnabled) {
            const dt = getElapseMillisecondsMessage(baseTimestamp);
            console.trace(`Leaving ${message}${dt}`);
        }
    }
    show() { }
    trace(message) {
        if (this.traceEnabled) {
            console.trace(message);
        }
    }
    debug(message) {
        if (this.debugEnabled) {
            console.debug(message);
        }
    }
    info(message) {
        if (this.infoEnabled) {
            console.info(message);
        }
    }
    warn(message) {
        console.warn(message);
    }
    error(message, ...optionalParams) {
        console.error(message, ...optionalParams);
    }
}
/* eslint-enable no-console */
