export function startSsgOutputRefresh({
  refresh,
  revisionUrl = "/__dev_revision.txt",
  intervalMs = 500,
  onState = () => {},
}) {
  if (typeof refresh !== "function") {
    throw new TypeError("refresh must be a function");
  }

  let currentRevision;
  let inFlight = false;
  let stopped = false;

  async function check() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const separator = revisionUrl.includes("?") ? "&" : "?";
      const response = await fetch(
        `${revisionUrl}${separator}t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;

      const nextRevision = (await response.text()).trim();
      if (!nextRevision) return;
      if (currentRevision !== undefined && currentRevision !== nextRevision) {
        await refresh(nextRevision);
      }
      currentRevision = nextRevision;
      onState("ready");
    } catch {
      onState("retrying");
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(check, intervalMs);
  void check();

  return {
    check,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
