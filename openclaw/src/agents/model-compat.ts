import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

function needsDeveloperRoleCompat(model: Model<Api>): boolean {
  const provider = (model.provider ?? "").trim().toLowerCase();
  const baseUrl = (model.baseUrl ?? "").trim().toLowerCase();
  return (
    provider === "zai" ||
    provider === "volces" ||
    baseUrl.includes("api.z.ai") ||
    baseUrl.includes("ark.cn-beijing.volces.com")
  );
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  if (!needsDeveloperRoleCompat(model) || !isOpenAiCompletionsModel(model)) {
    return model;
  }

  const openaiModel = model;
  const compat = openaiModel.compat ?? undefined;
  if (compat?.supportsDeveloperRole === false) {
    return model;
  }

  openaiModel.compat = compat
    ? { ...compat, supportsDeveloperRole: false }
    : { supportsDeveloperRole: false };
  return openaiModel;
}
