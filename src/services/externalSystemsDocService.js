import { apiClient } from "./http";
import { logger } from "../utils/logger";

const client = apiClient("externalSystems");
const inflightListRequests = new Map();

export async function listExternalSystems(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.append("page", params.page);
  if (params.page_size) q.append("page_size", params.page_size);
  if (params.system_code) q.append("system_code", params.system_code);
  if (params.system_type) q.append("system_type", params.system_type);
  if (typeof params.is_active !== "undefined")
    q.append("is_active", params.is_active ? "true" : "false");
  const url = q.toString() ? `/external-systems?${q}` : "/external-systems";

  if (inflightListRequests.has(url)) {
    return inflightListRequests.get(url);
  }

  const requestPromise = client
    .get(url)
    .catch((e) => {
      logger.error("[externalSystemsDocService] list failed", e);
      throw e;
    })
    .finally(() => {
      inflightListRequests.delete(url);
    });

  inflightListRequests.set(url, requestPromise);
  return requestPromise;
}

export async function getExternalSystem(id) {
  try {
    const resp = await client.get(
      `/external-systems/${encodeURIComponent(id)}`
    );
    return resp?.system || resp;
  } catch (e) {
    logger.error("[externalSystemsDocService] get failed", e);
    throw e;
  }
}

export async function createExternalSystem(data) {
  try {
    const resp = await client.post("/external-systems", data);
    return resp?.system || resp;
  } catch (e) {
    logger.error("[externalSystemsDocService] create failed", e);
    throw e;
  }
}

export async function updateExternalSystem(id, data) {
  try {
    const resp = await client.put(
      `/external-systems/${encodeURIComponent(id)}`,
      data
    );
    return resp?.system || resp;
  } catch (e) {
    logger.error("[externalSystemsDocService] update failed", e);
    throw e;
  }
}

export async function deleteExternalSystem(id) {
  try {
    return await client.delete(`/external-systems/${encodeURIComponent(id)}`);
  } catch (e) {
    logger.error("[externalSystemsDocService] delete failed", e);
    throw e;
  }
}

export default {
  listExternalSystems,
  getExternalSystem,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
};
