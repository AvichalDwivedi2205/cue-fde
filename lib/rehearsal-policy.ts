export type RehearsalRegistration = {
  appId: string;
  key: string;
  frontendOrigin: string;
  backendOrigin: string;
  cueOrigin: string;
  repository?: string;
};

export function rehearsalFingerprint(appId: string, key: string) {
  return `${appId}:rehearsal:${key}:upload:413`;
}

export function validateRehearsal(value: RehearsalRegistration) {
  if (
    !/^cue_app_[A-Za-z0-9_-]{3,80}$/.test(value.appId) ||
    !/^[a-z0-9][a-z0-9-]{2,63}$/.test(value.key)
  )
    throw new Error("Invalid rehearsal identity");
  const origins = [value.frontendOrigin, value.backendOrigin].map((origin) => {
    const url = new URL(origin);
    const port = Number(url.port);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      !Number.isInteger(port) ||
      port < 4320 ||
      port > 65535
    )
      throw new Error("Rehearsal must use dedicated loopback ports above 4319");
    return origin;
  });
  if (origins[0] === origins[1]) throw new Error("Rehearsal ports must differ");
  const cue = new URL(value.cueOrigin);
  if (
    cue.origin !== value.cueOrigin ||
    cue.username ||
    cue.password ||
    !(
      cue.protocol === "https:" ||
      (cue.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(cue.hostname))
    )
  )
    throw new Error("Invalid Cue origin");
  if (value.repository && !/^[\w.-]+\/[\w.-]+$/.test(value.repository))
    throw new Error("Invalid rehearsal repository");
  return value;
}
