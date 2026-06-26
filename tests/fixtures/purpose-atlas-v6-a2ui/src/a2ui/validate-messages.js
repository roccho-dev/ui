import {A2uiMessageSchema} from '@a2ui/web_core/v0_9';
import {
  ALLOWED_ATLAS_ACTIONS,
  ATLAS_CATALOG_ID,
  ATLAS_COMPONENT_APIS,
} from './apis.js';

const ALLOWED_PATH_ROOTS = ['/meta', '/ui', '/atlas', '/inspector', '/events', '/operations', '/toast', '/runtime'];
const MAX_MESSAGES = 32;
const MAX_COMPONENTS = 32;
const MAX_DATA_BYTES = 5_000_000;

function validateDynamicValues(value, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateDynamicValues(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'path')) {
    const path = value.path;
    if (typeof path !== 'string' || !path.startsWith('/')) throw new Error(`${trail}: binding path must be absolute JSON Pointer`);
    if (!ALLOWED_PATH_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))) throw new Error(`${trail}: binding path is outside Atlas DataModel: ${path}`);
  }
  if (Object.hasOwn(value, 'call') || Object.hasOwn(value, 'functionCall')) throw new Error(`${trail}: executable function calls are disabled for this surface`);
  if (value.event) {
    if (!ALLOWED_ATLAS_ACTIONS.has(value.event.name)) throw new Error(`${trail}: action is not allowlisted: ${value.event.name}`);
  }
  Object.entries(value).forEach(([key, child]) => validateDynamicValues(child, `${trail}.${key}`));
}

export function validateAtlasMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) throw new Error(`A2UI message count must be 1..${MAX_MESSAGES}`);
  messages.forEach((message, index) => {
    const parsed = A2uiMessageSchema.safeParse(message);
    if (!parsed.success) throw new Error(`A2UI schema error at message ${index + 1}: ${parsed.error.message}`);
  });

  const createMessages = messages.filter((message) => message.createSurface);
  if (createMessages.length !== 1) throw new Error('Exactly one createSurface message is required.');
  const create = createMessages[0].createSurface;
  if (create.catalogId !== ATLAS_CATALOG_ID) throw new Error(`Untrusted catalog: ${create.catalogId}`);

  const componentMessages = messages.filter((message) => message.updateComponents);
  let componentCount = 0;
  const componentIds = new Set();
  for (const message of componentMessages) {
    for (const component of message.updateComponents.components) {
      componentCount += 1;
      if (componentCount > MAX_COMPONENTS) throw new Error(`A2UI component limit exceeded: ${MAX_COMPONENTS}`);
      if (!component.id || componentIds.has(component.id)) throw new Error(`Duplicate or missing component id: ${component.id || '<missing>'}`);
      componentIds.add(component.id);
      const api = ATLAS_COMPONENT_APIS.get(component.component);
      if (!api) throw new Error(`Component is not in Atlas catalog: ${component.component}`);
      const {id, component: _type, weight: _weight, ...properties} = component;
      const parsed = api.schema.safeParse(properties);
      if (!parsed.success) throw new Error(`${component.component}(${id}) property error: ${parsed.error.message}`);
      validateDynamicValues(properties, `${component.component}(${id})`);
    }
  }
  if (!componentIds.has('root')) throw new Error('A2UI root component is required.');

  for (const message of messages.filter((item) => item.updateDataModel)) {
    const bytes = new TextEncoder().encode(JSON.stringify(message.updateDataModel.value)).byteLength;
    if (bytes > MAX_DATA_BYTES) throw new Error(`DataModel update exceeds ${MAX_DATA_BYTES} bytes.`);
  }
  return messages;
}
