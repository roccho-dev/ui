import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { createBaseCatalog } from "./catalog/base.mjs";
import { validateMessageBatch } from "./catalog/messages.mjs";

export const processWithWebCore = (
  messages,
  {
    catalog = createBaseCatalog(),
    catalogId = catalog.id,
    componentLimit = 512,
    requiredRootIds = ["root"],
    surfaceId = "main",
  } = {},
) => {
  const validated = validateMessageBatch(messages, { catalog, catalogId, componentLimit, requiredRootIds, surfaceId });
  const processor = new MessageProcessor([catalog]);
  let surface = null;
  const subscription = processor.onSurfaceCreated(value => { if (value.id === surfaceId) surface = value; });
  try {
    processor.processMessages(validated);
  } finally {
    subscription.unsubscribe();
  }
  if (!surface) throw new Error(`a2ui-web-core: ${surfaceId} surface was not created`);
  return Object.freeze({
    components: validated[2].updateComponents.components,
    dataModel: validated[1].updateDataModel.value,
    surface,
    surfaceId,
  });
};
