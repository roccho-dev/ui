import { createIncrementalSurfaceRuntime } from './incremental-surface.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`a2ui-feature-app: ${message}`); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, name) => { invariant(typeof value === 'string' && value.length > 0, `${name} required`); return value; };

const validateDesign = (design, featureId) => {
  invariant(plain(design), 'design object required');
  invariant(design.schema === 'ui-a2ui-app-design/1', 'design schema is invalid');
  invariant(design.app === featureId, `design.app must be ${featureId}`);
  text(design.catalogId, 'design.catalogId');
  text(design.surfaceId, 'design.surfaceId');
  text(design.rootId, 'design.rootId');
  if (design.css !== undefined) invariant(typeof design.css === 'string', 'design.css must be a string');
  invariant(Array.isArray(design.messages) && design.messages.length > 0, 'design.messages required');
  invariant(design.messages[0]?.createSurface, 'design.messages must start with createSurface');
  return design;
};

const injectCss = ({ design, document }) => {
  document.querySelector('style[data-a2ui-app-design]')?.remove();
  if (!design.css) return;
  const style = document.createElement('style');
  style.dataset.a2uiAppDesign = `${design.app}:${design.schema}`;
  style.textContent = design.css;
  document.head.append(style);
};

export const mountFeature = async ({ feature, input, root, scope = globalThis }) => {
  invariant(plain(input), 'input object required');
  const design = validateDesign(input.design, feature?.id);
  invariant(typeof feature?.plan === 'string' && feature.plan, 'feature.plan required');
  const planUrl = new URL(feature.plan, scope.location.href);
  invariant(planUrl.origin === scope.location.origin, 'feature.plan must be same-origin');
  const module = await import(planUrl.href);
  invariant(typeof module.createFeaturePlan === 'function', 'plan createFeaturePlan export required');

  const document = root.ownerDocument;
  injectCss({ design, document });
  const plan = await module.createFeaturePlan({ design, feature, input, root, scope });
  invariant(plan && typeof plan === 'object', 'plan object required');
  invariant(plan.catalog && typeof plan.catalog.validateComponent === 'function', 'plan catalog required');
  invariant(Array.isArray(plan.messages) && plan.messages.length > 0, 'plan messages required');

  const mountSurface = ({
    catalog = plan.catalog,
    catalogId = catalog.id,
    messages,
    mount,
    onAction = () => {},
    requiredRootIds = ['root'],
    rootId = requiredRootIds[0],
    surfaceId,
  }) => {
    invariant(mount && typeof mount.replaceChildren === 'function', 'surface mount required');
    invariant(Array.isArray(messages) && messages.length > 0, 'surface messages required');
    const runtime = createIncrementalSurfaceRuntime({
      catalog,
      catalogId,
      document,
      eventTarget: scope,
      mount,
      onAction,
      requiredRootIds,
      rootId,
      surfaceId,
    });
    runtime.apply(messages);
    return runtime;
  };

  const runtime = mountSurface({
    catalog: plan.catalog,
    catalogId: design.catalogId,
    messages: plan.messages,
    mount: root,
    onAction: plan.onAction,
    requiredRootIds: [design.rootId],
    rootId: design.rootId,
    surfaceId: design.surfaceId,
  });

  const controller = typeof plan.attach === 'function'
    ? await plan.attach({ design, feature, input, mountSurface, root, runtime, scope })
    : null;
  const read = typeof controller?.read === 'function'
    ? controller.read
    : typeof plan.read === 'function'
      ? () => plan.read({ design, input, root, runtime, scope })
      : () => runtime.read();

  return Object.freeze({
    ...(controller && typeof controller === 'object' ? controller : {}),
    read,
    schema: controller?.schema ?? plan.schema ?? 'ui-a2ui-feature-runtime/1',
  });
};
