import { createUrlModuleUrl, readUrlModule } from './codec.mjs';

export const createDataTransport = (scope = globalThis) => {
  const create = (value, { base = scope.location.href } = {}) => createUrlModuleUrl({
    base,
    fragment: 'data',
    value,
  });
  const read = input => readUrlModule({ fragment: 'data', input });
  const replace = async value => {
    const url = await create(value);
    scope.history.replaceState(scope.history.state, '', url);
    return url;
  };
  return Object.freeze({ schema: 'ui-data-transport/1', fragment: 'data', create, read, replace });
};
